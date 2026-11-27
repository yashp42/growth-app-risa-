import { currentOutlook } from '../llm/outlook.ts';
import { getTodayIstIso, isValidIsoDate } from '../gates.ts';
import { createHash } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { getVerifiedActor, requireAuth, type AuthDependencies } from '../auth.ts';
import type { ServerConfig } from '../config.ts';
import type { DatabasePoolState } from '../db.ts';
import { AppApiError, asyncHandler } from '../errors.ts';
import { requirePermission } from '../permissions.ts';
import { requireWriteRoles, resolveWritableEdition, runWriteTransaction, ensureUiImportBatch, fetchAppDataVersion, insertAuditEvent } from '../writeUtils.ts';
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
   return {dataset_id:id,row_count:data.rows.length,data_version:version,duplicate:false};
  });
  res.status(result.duplicate?200:201).json(result);
 }));
 return router;
}
