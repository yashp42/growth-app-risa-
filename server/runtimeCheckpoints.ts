import type { DatabasePoolState, VerifiedActor } from './db.ts';
import { withActorTransaction } from './db.ts';
import { ensureUiImportBatch, insertAuditEvent } from './writeUtils.ts';
import { gzipSync, gunzipSync } from 'node:zlib';
import { adoptKnowledgeRanking } from './llm/retrievalRanking.ts';
export function encodeCheckpoint(value:unknown) {return {encoding:'gzip-base64',data:gzipSync(JSON.stringify(value)).toString('base64')};}
export function decodeCheckpoint(value:unknown):unknown {
  if(!value || typeof value!=='object')return null;
  const p=value as Record<string,unknown>;
  if(p.encoding!=='gzip-base64'||typeof p.data!=='string')return null;
  return JSON.parse(gunzipSync(Buffer.from(p.data,'base64'),{maxOutputLength:8*1024*1024}).toString('utf8'));
}
/** Append-only administrative audit snapshots; never a financial or campaign write. */
export async function saveRuntimeCheckpoint(db:DatabasePoolState,actor:VerifiedActor,key:string,value:unknown) {
  if(!/^analyst-evaluation:(gate|full|retrieval)$/.test(key))throw new Error('Unknown checkpoint key');
  return withActorTransaction(actor,async client=>{
    const edition='ED-2026-DEMO';
    const batch=await ensureUiImportBatch(client,edition,'simulated',actor.memberId);
    const version=await client.query<{data_version:number}>('SELECT data_version FROM public.app_state WHERE id=1');
    const state=(value as {run?:{state?:string}})?.run?.state??'unknown';
    await insertAuditEvent(client,{actorId:actor.memberId,entity:'analyst_evaluation',entityId:key,operation:'insert',after:{checkpoint_state:state,checkpoint:encodeCheckpoint(value)},dataVersion:Number(version.rows[0]?.data_version??0),recordClass:'simulated',importBatchId:batch,sourceRef:'system:analyst_evaluation'});
  },db);
}
export async function loadRuntimeCheckpoint(db:DatabasePoolState,actor:VerifiedActor,key:string):Promise<unknown|null> {
  if(!db.pool)return null;
  const result=await db.pool.query<{after:{checkpoint?:unknown}}>(`SELECT "after" FROM public.audit_event WHERE entity='analyst_evaluation' AND entity_id=$1 AND actor_id=$2 AND source_ref='system:analyst_evaluation' AND NOT is_deleted ORDER BY created_at DESC,audit_id DESC LIMIT 1`,[key,actor.memberId]);
  return decodeCheckpoint(result.rows[0]?.after?.checkpoint);
}
/** Restore only a completed measured comparison; ties follow the existing adoption policy. */
export async function restoreRuntimeRanking(db:DatabasePoolState) {
  if(!db.pool)return;
  const result=await db.pool.query<{after:{checkpoint?:unknown}}>(`SELECT "after" FROM public.audit_event WHERE entity='analyst_evaluation' AND entity_id='analyst-evaluation:retrieval' AND source_ref='system:analyst_evaluation' AND "after"->>'checkpoint_state'='completed' AND NOT is_deleted ORDER BY created_at DESC,audit_id DESC LIMIT 1`);
  const saved=decodeCheckpoint(result.rows[0]?.after?.checkpoint) as {run?:{state?:string};retrieval?:{results?:Record<string,unknown>}}|null;
  if(saved?.run?.state!=='completed')return;
  const scores=saved.retrieval?.results;
  const mean=(key:string):number|null=>{
    const rows=scores?.[key];if(!Array.isArray(rows)||!rows.length)return null;
    const values=rows.map(r=>Number(r.recall));if(values.some(n=>!Number.isFinite(n)||n<0||n>1))throw new Error('Invalid stored retrieval comparison');
    return values.reduce((a,b)=>a+b,0)/values.length;
  };
  const a=mean('variant_a');if(a===null)return;
  adoptKnowledgeRanking(a,mean('variant_b'),mean('variant_c'),mean('variant_d'));
}
