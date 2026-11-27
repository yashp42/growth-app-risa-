import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

/** Explicit LIVE acceptance: synthetic records in ED-2026-DEMO only, always soft-cleaned. */
if(!process.argv.includes('--confirm-demo-tests'))throw Error('Pass --confirm-demo-tests to create disposable demo records.');
const base='https://sponsorship-growth-platform.onrender.com';
const scope={edition_id:'ED-2026-DEMO',record_class:'simulated'};
const asOf=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const prefix='LIVE-ACCEPTANCE-'+randomUUID().slice(0,8);
const log:string[]=[];let token='',baseline:number|null=null;
const cleanup:Array<{kind:string;id:string}>=[];
const pendingActions:string[]=[];
let aiAttempts=0;
async function request(path:string,method='GET',body?:unknown){
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(55000)});
 const payload=await response.json() as Record<string,any>;
 if(!response.ok)throw Error(`${method} ${path.split('?')[0]}: HTTP ${response.status} ${payload.code??''} ${payload.message??payload.error??''}`);
 return payload;
}
const query=(extra:Record<string,string>={})=>'?'+new URLSearchParams({...scope,as_of:asOf,...extra});
const list=async(kind:string,search='')=>{const p=await request('/api/'+kind+query(search?{search}:{}));return (p[kind]??p.rows??[]) as Record<string,any>[];};
const metric=async()=>{const p=await request('/api/metrics/query','POST',{...scope,as_of:asOf,metric_ids:['M-21']});const row=(p.results??p.metrics)?.[0];assert.equal(row?.computable,true);return Number(row.value);};
const create=async(kind:string,body:Record<string,unknown>,singular:string)=>{const p=await request('/api/'+kind,'POST',{...body,...scope});const id=p[singular]?.[singular+'_id']??p.id;assert.equal(typeof id,'string');cleanup.push({kind,id});return {id,p};};
const ask=async(question:string,conversation_id?:string)=>{
 const p=await request('/api/ai/ask','POST',{...scope,as_of:asOf,question,...(conversation_id?{conversation_id}:{})});
 aiAttempts+=Number(p.token_usage?.model_requests??0);
 assert.equal(p.generation_status,'complete',`AI paused/fell back: ${p.generation_fallback_reason??p.answer}`);
 assert.equal(p.answer_check_passed,true,'Answer did not pass grounding checks.');
 return p;
};
try{
 const auth=await request('/api/auth/demo','POST',{});token=auth.access_token;assert.ok(token);
 const me=await request('/api/me?edition_id=ED-2026-DEMO');assert.equal(me.member_id,'SIM-LEAD');assert.equal(me.verified_by_server,true);
 for(const role of ['coordination_lead','admin','finance_collections'])assert.ok(me.roles.includes(role));
 const recovery=process.argv.find(a=>a.startsWith('--recover-id='))?.split('=')[1];
 if(recovery){
  try{const found=await request('/api/opportunities/'+encodeURIComponent(recovery)+query());const row=found.opportunity;
   assert.ok(String(row?.name??'').startsWith('LIVE-ACCEPTANCE-'),'Recovery is restricted to labelled acceptance fixtures.');
   await request('/api/opportunities/'+encodeURIComponent(recovery)+query(),'PATCH',{is_deleted:true});
   log.push('LIVE: recovered the previously interrupted synthetic opportunity fixture.');
  }catch(e){if(!String((e as Error).message).includes('HTTP 404'))throw e;}
 }
 if(process.argv.includes('--recover-only')){for(const line of log)console.log(line);console.log('LIVE: interrupted-fixture recovery finished; no new records created.');process.exit(0);}
 // Wait only for the new read endpoint to become available during a Render deploy. Never retry writes.
 let ready=false;
 for(let i=0;i<5;i++){try{await request('/api/outlook'+query());ready=true;break;}catch(e){if(i===4)throw e;await new Promise(r=>setTimeout(r,5000));}}
 assert.ok(ready);baseline=await metric();const version=await request('/api/version');
 const reference=await request('/api/reference/channels'+query());const channel=reference.channels.find((c:any)=>c.is_active!==false);assert.ok(channel);
 const sponsors=await list('sponsors');const eligible=sponsors.find(s=>['prospect','active','past_sponsor'].includes(s.lifecycle_status));assert.ok(eligible,'No eligible demo sponsor for a pipeline fixture.');
 const campaign=await create('campaigns',{name:prefix+' campaign',channel_id:channel.channel_id,owner_member_id:'SIM-LEAD',status:'planned'},'campaign');
 await request('/api/campaigns/'+campaign.id,'PATCH',{...scope,name:prefix+' edited campaign'});
 assert.ok((await list('campaigns',prefix)).some(c=>c.campaign_id===campaign.id&&c.name===prefix+' edited campaign'));
 log.push('LIVE: campaign create, edit and fresh database read passed.');
 const sponsor=await create('sponsors',{display_name:prefix+' sponsor',lifecycle_status:'research_target',first_source:'research'},'sponsor');
 await request('/api/sponsors/'+sponsor.id,'PATCH',{...scope,city:'Synthetic acceptance fixture'});
 assert.ok((await list('sponsors',prefix)).some(s=>s.sponsor_id===sponsor.id&&s.city==='Synthetic acceptance fixture'));
 log.push('LIVE: sponsor create, edit and fresh database read passed.');
 const due=new Date(Date.now()+86400000).toISOString();
 const task=await create('tasks',{title:prefix+' task',task_type:'follow_up',owner_member_id:'SIM-LEAD',due_at:due,linked_type:'campaign',linked_id:campaign.id},'task');
 await request('/api/tasks/'+task.id,'PATCH',{...scope,status:'done'});
 assert.ok((await list('tasks',prefix)).some(t=>t.task_id===task.id&&t.status==='done'));
 log.push('LIVE: task create, completion and database read passed.');
 const outlookBefore=await request('/api/outlook'+query());
 const opportunity=await create('opportunities',{sponsor_id:eligible.sponsor_id,name:prefix+' opportunity',support_type:'cash',proposed_value:1234,owner_member_id:'SIM-LEAD',originating_campaign_id:campaign.id},'opportunity');
 assert.equal(await metric(),baseline+1234);
 await request('/api/opportunities/'+opportunity.id+'/stage','POST',{...scope,stage:'contacted',proposed_value:2468});
 assert.equal(await metric(),baseline+2468);
 const outlookAfter=await request('/api/outlook'+query());
 if(outlookBefore.available&&outlookAfter.available){assert.equal(outlookAfter.open_cash,outlookBefore.open_cash+2468);assert.ok(outlookAfter.indicative_total_cash>=outlookBefore.indicative_total_cash);}
 const afterVersion=await request('/api/version');assert.ok(Number(afterVersion.data_version??afterVersion.version)>Number(version.data_version??version.version));
 log.push('LIVE: pipeline value changed by exactly the new then edited amount; version and outlook inputs refreshed.');
 const csvInput={...scope,name:prefix+' synthetic reference CSV',csv:'Brand,Opportunity Value INR,Stage\nSynthetic Alpha,100,proposal_sent\nSynthetic Beta,200,contacted'};
 const upload=await request('/api/imports/dataset','POST',csvInput);
 assert.equal(upload.row_count,2);assert.equal(upload.duplicate,false);
 const repeatUpload=await request('/api/imports/dataset','POST',csvInput);
 assert.equal(repeatUpload.dataset_id,upload.dataset_id);assert.equal(repeatUpload.duplicate,true);
 assert.equal(await metric(),baseline+2468,'Reference upload changed operational cash/pipeline metrics.');
 log.push('LIVE: custom CSV persisted, identical re-upload reused the same dataset, and reference values stayed out of operational totals. Its labelled synthetic audit snapshot is retained.');
 if(process.argv.includes('--with-ai')){
  const answer=await ask(`Find the campaign named "${prefix} edited campaign" and tell me its owner and status. Do not create anything.`);
  assert.match(JSON.stringify([answer.answer,answer.blocks]),new RegExp(prefix));
  assert.ok(answer.tool_calls?.some((t:any)=>t.tool_name==='list_records'));
  const followup=await ask('What is its current status?',answer.conversation_id);assert.equal(followup.cached,false);
  log.push('LIVE: Analyst found the newly saved campaign and answered its follow-up without a stale first-turn cache.');
  const proposal=await ask(`Create a task with title "${prefix} AI task", task_type follow_up, owner_member_id SIM-LEAD, due_at "${due}", linked_type campaign and linked_id "${campaign.id}".`);
  const actions=proposal.actions??[];pendingActions.push(...actions.map((a:any)=>a.ai_action_id));assert.equal(actions.length,1);const a=actions[0];
  assert.equal(a.action_type,'create_task');assert.equal(a.payload.title,prefix+' AI task');assert.equal(a.payload.owner_member_id,'SIM-LEAD');assert.equal(a.payload.linked_id,campaign.id);
  assert.equal((await list('tasks',prefix)).filter(t=>t.title===prefix+' AI task').length,0,'Proposal executed before confirmation.');
  await request('/api/actions/'+a.ai_action_id+'/confirm','POST',{...scope,payload_hash:a.payload_hash??a.payload_sha256});
  const saved=(await list('tasks',prefix)).filter(t=>t.title===prefix+' AI task');assert.equal(saved.length,1);cleanup.push({kind:'tasks',id:saved[0].task_id});
  try{await request('/api/actions/'+a.ai_action_id+'/confirm','POST',{...scope,payload_hash:a.payload_hash??a.payload_sha256});}catch{/* Replay rejection is also acceptable. */}
  assert.equal((await list('tasks',prefix)).filter(t=>t.title===prefix+' AI task').length,1);
  log.push('LIVE: proposed task required confirmation, saved exactly once and replay did not duplicate it.');
 }
}finally{
 const failures:string[]=[];
 for(const id of pendingActions)try{await request('/api/actions/'+id+'/cancel','POST',scope);}catch{/* Already executed actions cannot be cancelled. */}
 // Recover IDs after an acknowledgement/network failure; never touch records outside this unique prefix.
 if(token)for(const kind of ['tasks','opportunities','sponsors','campaigns']){
  try{for(const row of await list(kind,prefix)){
   const name=String(row.title??row.display_name??row.name??'');if(!name.startsWith(prefix))continue;
   const id=String(row[({tasks:'task_id',opportunities:'opportunity_id',sponsors:'sponsor_id',campaigns:'campaign_id'} as Record<string,string>)[kind]]);
   if(!cleanup.some(x=>x.kind===kind&&x.id===id))cleanup.push({kind,id});
  }}catch(e){failures.push('Recovery read '+kind+': '+(e as Error).message);}
 }
 for(const kind of ['tasks','opportunities','sponsors','campaigns'])for(const row of cleanup.filter(r=>r.kind===kind))try{await request('/api/'+row.kind+'/'+row.id+query(),'PATCH',{is_deleted:true});}catch(e){failures.push(row.kind+'/'+row.id+': '+(e as Error).message);}
 if(baseline!==null&&token)try{assert.equal(await metric(),baseline);log.push('LIVE: cleanup restored the original pipeline total.');}catch(e){failures.push('Pipeline restoration: '+(e as Error).message);}
 for(const line of log)console.log(line);
 console.log('LIVE model request attempts:',aiAttempts);
 if(failures.length)throw Error('Cleanup needs review: '+failures.join('; '));
}
