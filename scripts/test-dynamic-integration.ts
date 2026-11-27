import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createImportApiRouter } from '../server/routes/importApi.ts';
import { createAiApiRouter } from '../server/routes/aiApi.ts';
import { apiErrorHandler } from '../server/errors.ts';
import { currentOutlook } from '../server/llm/outlook.ts';
import { loadServerConfig } from '../server/config.ts';
import type { ToolExecutionContext } from '../server/llm/tools.ts';

async function harness(roles=['coordination_lead','admin','finance_collections'],scriptedCompletion?:(input:any,call:number)=>any){
 const queries:{sql:string;params:unknown[]}[]=[],audits:any[]=[];
 let version=91;
 const query=async(sql:string,params:unknown[]=[])=>{
  queries.push({sql,params});let rows:any[]=[];
  if(sql.includes('information_schema.tables'))rows=[{table_name:'team_member'},{table_name:'role_assignment'}];
  else if(sql.includes('information_schema.columns'))rows=[...['member_id','auth_user_id','is_active','is_deleted','email'].map(column_name=>({table_name:'team_member',column_name})),...['role','member_id','edition_id','valid_to','is_current','is_deleted'].map(column_name=>({table_name:'role_assignment',column_name}))];
  else if(sql.includes('FROM public.team_member')&&sql.includes('auth_user_id'))rows=[{member_id:'MOCK-LEAD',full_name:'Mock Reviewer',email:'mock@example.invalid'}];
  else if(sql.includes('FROM public.role_assignment'))rows=roles.map(role=>({role}));
  else if(sql.includes('FROM public.festival_edition'))rows=[{edition_id:params[0],record_class:params[0]==='ED-2025'?'historical_synthetic':'simulated'}];
  else if(sql.includes('SELECT data_version FROM public.app_state'))rows=[{data_version:version}];
  else if(sql.includes('FROM public.opportunity o')&&sql.includes('JOIN public.sponsor sp'))rows=[{opportunity_id:'O-WARM-1',name:'Warm Open Deal',sponsor_id:'S-WARM-1',sponsor_name:'Warm Sponsor',campaign_id:'C-WARM-1',stage:'proposal_sent',state:'open',proposed_value:50000,confirmed_value:null,owner_member_id:'MEMBER-7',owner_name:'Warm Owner',stage_since:'2026-11-20',created_at:'2026-11-01'}];
  else if(sql.includes('INSERT INTO public.audit_event'))audits.push({entity_id:params[5],after:JSON.parse(String(params[7])),created_at:'2026-11-27'});
  else if(sql.includes("entity='uploaded_dataset'"))rows=audits.filter(a=>!params[3]||a.entity_id===params[3]);
  return {rows,rowCount:rows.length};
 };
 const pool={query,connect:async()=>({query,release(){}})} as any;
 const db={pool,configured:true,initErrorCode:null};
 const auth={dbState:db,defaultEditionId:'ED-2026-DEMO',authConfigured:true,supabaseClient:{auth:{getUser:async()=>({data:{user:{id:'MOCK-AUTH',email:'mock@example.invalid',email_confirmed_at:'2026-01-01'}},error:null})}}} as any;
 const config={...loadServerConfig({}),appEnv:'demo',editionIdDefault:'ED-2026-DEMO'};
 let modelCalls=0;const modelInputs:any[]=[];
 const model={fetchQuota:async()=>({exhausted:false}),createChatCompletion:async(input:any)=>{modelCalls++;modelInputs.push(input);return scriptedCompletion?scriptedCompletion(input,modelCalls):{model:'MOCK-FREE',message:{role:'assistant',content:'Start with a clear audience fit, offer a specific benefit, and agree on a practical next step.'},usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30},requestAttempts:1};},getHealthSnapshot:async()=>({}),stop(){}} as any;
 const app=express();app.use(express.json({limit:'1mb'}));app.use('/api',createImportApiRouter(config,db,auth));app.use('/api',createAiApiRouter(config,db,auth,{openrouter:model}).router);app.use('/api',apiErrorHandler);
 const server=await new Promise<any>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const url='http://127.0.0.1:'+server.address().port;
 return {queries,audits,modelInputs,get modelCalls(){return modelCalls;},setVersion(v:number){version=v;},post:async(path:string,body:any,token=true)=>{const r=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer MOCK-TOKEN'}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};},close:()=>new Promise<void>(r=>server.close(()=>r()))};
}
test('[MOCKED] CSV HTTP import persists an actor-bound dataset and repeat upload is idempotent',async()=>{
 const h=await harness();try{
  const body={edition_id:'ED-2026-DEMO',record_class:'simulated',name:'Reviewer CSV',csv:'Brand,Amount\nMock A,1250'};
  const a=await h.post('/api/imports/dataset',body);assert.equal(a.status,201);assert.equal(a.body.row_count,1);
  const b=await h.post('/api/imports/dataset',body);assert.equal(b.status,200);assert.equal(b.body.duplicate,true);assert.equal(h.audits.length,1);
  assert.deepEqual(h.audits[0].after.rows,[{Brand:'Mock A',Amount:'1250'}]);
  assert.ok(h.queries.some(q=>q.sql.includes("set_config('app.actor_member_id'")&&q.params[0]==='MOCK-LEAD'));
  assert.ok(h.queries.some(q=>q.sql==='COMMIT'));
 }finally{await h.close();}
});
test('[MOCKED] invalid CSV, historical scope, unauthenticated and viewer uploads cannot write',async()=>{
 for(const [roles,body,token,expected] of [
  [['coordination_lead'],{edition_id:'ED-2026-DEMO',record_class:'simulated',name:'Bad',csv:'a,a\n1,2'},true,422],
  [['coordination_lead'],{edition_id:'ED-2025',record_class:'simulated',name:'Bad',csv:'a\n1'},true,403],
  [['viewer'],{edition_id:'ED-2026-DEMO',record_class:'simulated',name:'Bad',csv:'a\n1'},true,403],
  [['coordination_lead'],{edition_id:'ED-2026-DEMO',record_class:'simulated',name:'Bad',csv:'a\n1'},false,401],
 ] as const){const h=await harness([...roles]);try{assert.equal((await h.post('/api/imports/dataset',body,token)).status,expected);assert.equal(h.audits.length,0);}finally{await h.close();}}
});
test('[MOCKED] operational import is a single auditable batch and rejects a bad relationship before inserts',async()=>{
 const good={edition_id:'ED-2026-DEMO',record_class:'simulated',name:'Sponsors.csv',destination:'sponsors',source_hash:'a'.repeat(64),mapping_hash:'c'.repeat(64),mapping_version:'csv-operational-v1',rows:[{display_name:'Batch Sponsor',first_source:'research'}]};
 const h=await harness();try{
  const ok=await h.post('/api/imports/operational',good);assert.equal(ok.status,201);assert.equal(ok.body.row_count,1);assert.match(ok.body.batch_id,/^IB-FILE-/);
  assert.ok(h.queries.some(q=>q.sql.includes("batch_type,record_class,source_file,source_sha256")));
  assert.ok(h.queries.some(q=>q.sql.includes("'ui:operational_import'")));
 }finally{await h.close();}
 const bad={...good,source_hash:'b'.repeat(64),rows:[{display_name:'Bad category',category_id:'CAT-MISSING'}]};
 const blocked=await harness();try{
  const fail=await blocked.post('/api/imports/operational',bad);assert.equal(fail.status,422);
  assert.equal(blocked.queries.some(q=>q.sql.includes('INSERT INTO public.sponsor')),false);
  assert.ok(blocked.queries.some(q=>q.sql==='ROLLBACK'));
 }finally{await blocked.close();}
});
test('[MOCKED] general how-to answer makes one completion without tools or business retrieval',async()=>{
 const h=await harness();try{const r=await h.post('/api/ai/chat',{message:'How do I approach a sponsor?',edition_id:'ED-2026-DEMO',record_class:'simulated',as_of:'2026-11-27'});
  assert.equal(r.status,200);assert.match(r.body.answer,/audience fit/);assert.equal(h.modelCalls,1);assert.equal(h.modelInputs[0].tools,undefined);
  assert.equal(h.queries.filter(q=>/metrics\.get_metric|knowledge_chunk|entity='uploaded_dataset'/.test(q.sql)).length,0);
 }finally{await h.close();}
});
test('[MOCKED] draft-only task request can investigate current records while write tool stays unavailable',async()=>{
 const h=await harness(['coordination_lead'],(_input,call)=>call===1?{model:'MOCK-FREE',finishReason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'read-open-warm',type:'function',function:{name:'list_records',arguments:JSON.stringify({kind:'opportunities',filters:{channel_group:'warm',state:'open'},limit:25})}}]},usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20},requestAttempts:1}:{model:'MOCK-FREE',finishReason:'stop',message:{role:'assistant',content:'The open warm opportunity is Warm Sponsor — Warm Open Deal. Its recorded owner is Warm Owner and the linked record is O-WARM-1. No due date was returned, so I have not created a task; tell me the deadline you want.'},usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30},requestAttempts:1});
 try{
  const prompt='Based on the warm-channel result, prepare a follow-up task for the highest-priority open opportunity. Show its owner and linked record; do not create it yet.';
  const r=await h.post('/api/ai/chat',{message:prompt,edition_id:'ED-2026-DEMO',record_class:'simulated',as_of:'2026-11-27',conversation_id:'TEST-WARM-FOLLOWUP'});
  assert.equal(r.status,200);assert.match(r.body.answer,/Warm Owner/);assert.match(r.body.answer,/No due date/);assert.deepEqual(r.body.action_ids,[]);
  const opportunityQuery=h.queries.find(q=>q.sql.includes('FROM public.opportunity o'));
  assert.ok(opportunityQuery);assert.match(opportunityQuery!.sql,/ch\.channel_group = \$\d+/);assert.ok(opportunityQuery!.params.includes('warm'));
  assert.equal(h.modelInputs[0].tools.some((t:any)=>t.function.name==='propose_changes'),false);
  assert.equal(h.queries.some(q=>q.sql.includes('INSERT INTO public.task')),false);
  assert.match(h.modelInputs[0].messages.find((m:any)=>m.role==='system'&&String(m.content).includes('Never invent task dates'))?.content,/Never invent task dates/);
 }finally{await h.close();}
});
test('[MOCKED] outlook changes with pipeline and cash records while keeping approved targets untouched',async()=>{
 let open=100000,cash=20000;
 const ctx:ToolExecutionContext={pool:{query:async<T>(sql:string)=>({rows:(sql.includes('metrics.get_metric')?[{metric_id:'M-01',value:cash,computable:true},{metric_id:'M-03',value:100000,computable:true},{metric_id:'M-06',value:0.2,computable:true},{metric_id:'M-13',value:0.5,computable:true}]:[{open_cash:open,excluded_non_cash_deals:1}]) as T[]})},actorMemberId:'MOCK',roles:['coordination_lead','finance_collections'],defaultEditionId:'ED-2026-DEMO',userSeason:{editionId:'ED-2026-DEMO',recordClass:'simulated',asOf:'2026-11-27'}};
 const before=await currentOutlook(ctx);assert.equal(before.indicative_total_cash,46000);
 open=200000;cash=30000;const after=await currentOutlook(ctx);assert.equal(after.indicative_total_cash,64000);assert.match(String(after.method),/not an approved/);
 assert.equal((await currentOutlook({...ctx,roles:['viewer']})).available,false);
 assert.equal((await currentOutlook({...ctx,userSeason:{...ctx.userSeason,recordClass:'historical_synthetic'}})).available,false);
});
