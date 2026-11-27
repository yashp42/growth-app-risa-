import { currentOutlook } from '../llm/outlook.ts';
import { getTodayIstIso, isValidIsoDate } from '../gates.ts';
import { createHash } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { getVerifiedActor, requireAuth, type AuthDependencies } from '../auth.ts';
import type { ServerConfig } from '../config.ts';
import type { DatabasePoolState } from '../db.ts';
import { AppApiError, asyncHandler } from '../errors.ts';
import { evaluatePermission, requirePermission, type BusinessEntityDomain } from '../permissions.ts';
import { requireWriteRoles, resolveWritableEdition, runWriteTransaction, ensureUiImportBatch, fetchAppDataVersion, insertAuditEvent, generatePrefixedId } from '../writeUtils.ts';
import { parseCsv } from '../../src/lib/csvImport.ts';
import { readUploads } from '../uploadedDatasets.ts';

/** User uploads are actor-scoped reference snapshots, never implicitly booked as cash. */
export function createImportApiRouter(config:ServerConfig,db:DatabasePoolState,auth:AuthDependencies){
 const router=Router();
 router.get('/outlook',requireAuth(auth),requireWriteRoles(auth),asyncHandler(async(req,res)=>{
  if(!db.pool)throw new AppApiError(503,'DB_UNAVAILABLE','Database unavailable.');
  const actor=getVerifiedActor(req),editionId=String(req.query.edition_id??config.editionIdDefault),recordClass=String(req.query.record_class??'simulated');
  const asOf=String(req.query.as_of??getTodayIstIso());
  if(!isValidIsoDate(asOf))throw new AppApiError(422,'INVALID_DATE','Use YYYY-MM-DD.');
  const out=await currentOutlook({pool:db.pool,actorMemberId:actor.memberId,roles:req.resolvedMember?.roles??[],defaultEditionId:config.editionIdDefault,userSeason:{editionId,recordClass:recordClass as 'live'|'simulated',asOf}});
  res.json(out);
 }));
 router.post('/imports/dataset',requireAuth(auth),requireWriteRoles(auth),requirePermission('sponsors_contacts_research','create'),asyncHandler(async(req,res)=>{
  const input=z.object({name:z.string().trim().min(1).max(120),csv:z.string().min(1).max(512000),edition_id:z.string().min(1),record_class:z.enum(['simulated','live'])}).parse(req.body);
  let data;try{data=parseCsv(input.csv);}catch(e){throw new AppApiError(422,'INVALID_CSV',e instanceof Error?e.message:'Invalid CSV');}
  const actor=getVerifiedActor(req);
  const id='UPLOAD-'+createHash('sha256').update(JSON.stringify([actor.memberId,input.edition_id,input.record_class,input.name,data])).digest('hex').slice(0,24);
  const result=await runWriteTransaction(actor,db,async client=>{
   const edition=await resolveWritableEdition(client,input.edition_id,input.record_class);
   // Serialize identical imports, including concurrent clicks from different tabs.
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[id]);
   const existing=await readUploads(client,{actorMemberId:actor.memberId,editionId:edition.editionId,recordClass:edition.recordClass},id);
   if(existing.length)return {dataset_id:id,row_count:data.rows.length,duplicate:true};
   const batch=await ensureUiImportBatch(client,edition.editionId,edition.recordClass,actor.memberId);
   const version=await fetchAppDataVersion(client);
   await insertAuditEvent(client,{actorId:actor.memberId,entity:'uploaded_dataset',entityId:id,operation:'insert',after:{name:input.name,edition_id:edition.editionId,columns:data.columns,rows:data.rows,row_count:data.rows.length},dataVersion:version,recordClass:edition.recordClass,importBatchId:batch,sourceRef:'ui:csv_import',evidenceClass:'U'});
   // Reference uploads are intentionally append-only audit data rather than
   // operational facts. Analyst cache identity includes the uploaded snapshot
   // IDs, so this does not reuse an answer from before this import.
   return {dataset_id:id,row_count:data.rows.length,data_version:version,duplicate:false};
  });
  res.status(result.duplicate?200:201).json(result);
 }));

 // Operational imports deliberately use one database transaction. We do not
 // call the public HTTP write routes row-by-row: that would allow a later row
 // to fail after earlier rows had already changed the operating dataset.
 const operationalSchema=z.object({
  name:z.string().trim().min(1).max(120),source_hash:z.string().regex(/^[a-f0-9]{64}$/),
  mapping_hash:z.string().regex(/^[a-f0-9]{64}$/),mapping_version:z.string().trim().min(1).max(80),
  destination:z.enum(['sponsors','campaigns','opportunities','tasks']),
  edition_id:z.string().min(1),record_class:z.enum(['simulated','live']),
  rows:z.array(z.record(z.string(),z.string())).min(1).max(100),
 }).strict();
 const domainFor:Record<string,BusinessEntityDomain>={sponsors:'sponsors_contacts_research',campaigns:'outreach_interactions_meetings_qualifications',opportunities:'opportunities_stage',tasks:'tasks'};
 router.post('/imports/operational',requireAuth(auth),requireWriteRoles(auth),asyncHandler(async(req,res)=>{
  const input=operationalSchema.parse(req.body); const actor=getVerifiedActor(req);
  const decision=evaluatePermission(req.resolvedMember?.roles??[],domainFor[input.destination],'create');
  if(!decision.allowed)throw new AppApiError(403,'FORBIDDEN',`Your assigned role does not permit importing ${input.destination}.`);
  const result=await runWriteTransaction(actor,db,async client=>{
   const edition=await resolveWritableEdition(client,input.edition_id,input.record_class);
   // The source file fingerprint and the mapping fingerprint are deliberately
   // separate: the former preserves provenance, while both together make a
   // retry idempotent without treating a changed mapping as the same import.
   const idempotencyHash=createHash('sha256').update(`${input.source_hash}:${input.mapping_hash}`).digest('hex');
   const batchId=`IB-FILE-${idempotencyHash.slice(0,24)}`;
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[batchId]);
   const prior=await client.query('SELECT import_batch_id FROM public.import_batch WHERE import_batch_id=$1 AND NOT is_deleted',[batchId]);
   if(prior.rows.length)return {batch_id:batchId,row_count:input.rows.length,duplicate:true,data_version:await fetchAppDataVersion(client)};
   // Every relational reference is checked before the first INSERT. The
   // database transaction additionally protects against races and constraints.
   const ids=(field:string)=>[...new Set(input.rows.map(row=>row[field]).filter(Boolean))];
   const assertIds=async(table:string,column:string,values:string[],label:string,scoped=true)=>{if(!values.length)return;const found=await client.query<{id:string}>(`SELECT ${column} AS id FROM public.${table} WHERE ${column}=ANY($1::text[]) ${scoped?'AND record_class=$2':''} AND NOT is_deleted`,scoped?[values,edition.recordClass]:[values]);if(found.rows.length!==values.length)throw new AppApiError(422,'IMPORT_REFERENCE_MISSING',`A referenced ${label} is missing, ambiguous, or belongs to another workspace.`);};
   if(input.destination==='campaigns'){await assertIds('channel','channel_id',ids('channel_id'),'channel',false);await assertIds('team_member','member_id',ids('owner_member_id'),'owner');}
   if(input.destination==='opportunities'){await assertIds('sponsor','sponsor_id',ids('sponsor_id'),'sponsor');await assertIds('campaign','campaign_id',ids('originating_campaign_id'),'campaign');await assertIds('team_member','member_id',ids('owner_member_id'),'owner');}
   if(input.destination==='tasks'){await assertIds('team_member','member_id',ids('owner_member_id'),'owner');}
   if(input.destination==='sponsors'){await assertIds('category','category_id',ids('category_id'),'category',false);}
   if(decision.scope==='own')for(const row of input.rows){const owner=row.owner_member_id;if(owner&&owner!==actor.memberId)throw new AppApiError(403,'FORBIDDEN','Your role may only import records assigned to you.');}
   await client.query(`INSERT INTO public.import_batch (import_batch_id,batch_type,record_class,source_file,source_sha256,row_count,validation_status,source_ref,evidence_class,created_by) VALUES ($1,'file_import',$2,$3,$4,$5,'passed',$6,'U',$7)`,[batchId,edition.recordClass,input.name,input.source_hash,input.rows.length,`ui:operational_import:${input.mapping_version}`,actor.memberId]);
   const created:string[]=[];
   for(const row of input.rows){
    let entity:string,id:string,after:Record<string,unknown>;
    if(input.destination==='sponsors'){
     id=generatePrefixedId('SP-');entity='SPONSOR';const r=await client.query<Record<string,unknown>>(`INSERT INTO public.sponsor (sponsor_id,display_name,legal_name,category_id,lifecycle_status,first_source,website,city,record_class,import_batch_id,source_ref,evidence_class,created_by) VALUES ($1,$2,$3,$4,'research_target',COALESCE(NULLIF($5,''),'research'),$6,$7,$8,$9,'ui:operational_import','U',$10) RETURNING *`,[id,row.display_name,row.legal_name||null,row.category_id||null,row.first_source||null,row.website||null,row.city||null,edition.recordClass,batchId,actor.memberId]);after=r.rows[0]??{sponsor_id:id};
    }else if(input.destination==='campaigns'){
     id=generatePrefixedId('CA-');entity='CAMPAIGN';const owner=decision.scope==='own'?actor.memberId:(row.owner_member_id||actor.memberId);const r=await client.query<Record<string,unknown>>(`INSERT INTO public.campaign (campaign_id,edition_id,name,channel_id,owner_member_id,planned_start,planned_end,objective,status,record_class,import_batch_id,source_ref,evidence_class,created_by) VALUES ($1,$2,$3,$4,$5,NULLIF($6,'')::timestamptz,NULLIF($7,'')::timestamptz,$8,COALESCE(NULLIF($9,''),'planned'),$10,$11,'ui:operational_import','U',$12) RETURNING *`,[id,edition.editionId,row.name,row.channel_id,owner,row.planned_start||'',row.planned_end||'',row.objective||null,row.status||'',edition.recordClass,batchId,actor.memberId]);after=r.rows[0]??{campaign_id:id};
    }else if(input.destination==='opportunities'){
     id=generatePrefixedId('OP-');entity='OPPORTUNITY';const owner=decision.scope==='own'?actor.memberId:(row.owner_member_id||actor.memberId);const r=await client.query<Record<string,unknown>>(`INSERT INTO public.opportunity (opportunity_id,sponsor_id,edition_id,originating_campaign_id,support_type,name,record_class,import_batch_id,source_ref,evidence_class,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ui:operational_import','U',$9) RETURNING *`,[id,row.sponsor_id,edition.editionId,row.originating_campaign_id||null,row.support_type,row.name||null,edition.recordClass,batchId,actor.memberId]);const stage=await client.query<Record<string,unknown>>(`INSERT INTO public.opportunity_stage_version (history_id,opportunity_id,stage,owner_member_id,proposed_value,confirmed_value,version_no,record_class,import_batch_id,source_ref,evidence_class,created_by) VALUES ($1,$2,'prospecting',$3,NULLIF($4,'')::numeric,0,1,$5,$6,'ui:operational_import','U',$7) RETURNING *`,[generatePrefixedId('HV-'),id,owner,row.proposed_value||'',edition.recordClass,batchId,actor.memberId]);after={opportunity:r.rows[0]??{opportunity_id:id},initial_stage:stage.rows[0]};
    }else{
     id=generatePrefixedId('TK-');entity='TASK';const owner=decision.scope==='own'?actor.memberId:(row.owner_member_id||actor.memberId);const done=row.status==='done';const r=await client.query<Record<string,unknown>>(`INSERT INTO public.task (task_id,title,task_type,owner_member_id,due_at,status,completed_at,linked_type,linked_id,origin,record_class,import_batch_id,source_ref,evidence_class,created_by) VALUES ($1,$2,$3,$4,$5::timestamptz,COALESCE(NULLIF($6,''),'open'),${done?'now()':'NULL'},NULLIF($7,''),NULLIF($8,''),'manual',$9,$10,'ui:operational_import','U',$11) RETURNING *`,[id,row.title,row.task_type,owner,row.due_at,row.status||'',row.linked_type||'',row.linked_id||'',edition.recordClass,batchId,actor.memberId]);after=r.rows[0]??{task_id:id};
    }
    created.push(id);const version=await fetchAppDataVersion(client);await insertAuditEvent(client,{actorId:actor.memberId,entity,entityId:id,operation:'insert',after,dataVersion:version,recordClass:edition.recordClass,importBatchId:batchId,sourceRef:'ui:operational_import',evidenceClass:'U'});
   }
   return {batch_id:batchId,row_count:created.length,created_ids:created,data_version:await fetchAppDataVersion(client),duplicate:false};
  });
  res.status(result.duplicate?200:201).json(result);
 }));
 return router;
}
