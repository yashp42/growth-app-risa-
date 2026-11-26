import test from 'node:test';
import assert from 'node:assert/strict';
import type { DatabasePoolState } from '../server/db.ts';
import { encodeCheckpoint,decodeCheckpoint,saveRuntimeCheckpoint,loadRuntimeCheckpoint } from '../server/runtimeCheckpoints.ts';
test('[MOCKED] compressed checkpoints round-trip and reject malformed content',()=>{
 const value={run:{state:'paused',remaining:['NEXT'],results:[{answer:'Source-backed answer ₹71,000'}]}};
 assert.deepEqual(decodeCheckpoint(encodeCheckpoint(value)),value);
 assert.equal(decodeCheckpoint({encoding:'other',data:'x'}),null);
 assert.throws(()=>decodeCheckpoint({encoding:'gzip-base64',data:'broken'}));
});
test('[MOCKED] durable evaluation uses verified actor binding, existing audit provenance and owner-isolated reads',async()=>{
 const statements:string[]=[];let saved:Record<string,unknown>|undefined;let owner='';
 const query=async(sql:string,params:unknown[]=[])=>{
  statements.push(sql);
  if(sql.includes('SELECT data_version'))return {rows:[{data_version:81}]};
  if(sql.includes('INSERT INTO public.audit_event')){saved=JSON.parse(String(params[7]));owner=String(params[1]);}
  if(sql.includes('SELECT "after"'))return {rows:params[1]===owner?[{after:saved}]:[]};
  return {rows:[]};
 };
 const db={pool:{query,connect:async()=>({query,release:()=>{}})},configured:true,initErrorCode:null} as unknown as DatabasePoolState;
 const actor={memberId:'ADMIN-A',authUserId:'AUTH-A'},value={run:{state:'paused',remaining:['NEXT']}};
 await saveRuntimeCheckpoint(db,actor,'analyst-evaluation:gate',value);
 assert.ok(statements.some(s=>s.includes("set_config('app.actor_member_id'")));
 assert.deepEqual(await loadRuntimeCheckpoint(db,actor,'analyst-evaluation:gate'),value);
 assert.equal(await loadRuntimeCheckpoint(db,{memberId:'ADMIN-B',authUserId:'AUTH-B'},'analyst-evaluation:gate'),null);
 assert.ok(!statements.some(s=>/UPDATE public\.(?:opportunity|contract|receipt|task)|DELETE FROM/.test(s)));
 await assert.rejects(()=>saveRuntimeCheckpoint(db,actor,'untrusted-key',{}),/Unknown checkpoint/);
});
