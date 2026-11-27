export {};
/** LIVE, explicit CLI only. No model calls, no finance/operational records created. */
const base=process.env.EVAL_BASE_URL??'https://sponsorship-growth-platform.onrender.com';
if(new URL(base).origin!=='https://sponsorship-growth-platform.onrender.com')throw Error('This reviewer preparation command is scoped to the named demo deployment.');
let token='';
async function request(path:string,body?:unknown){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(55000)});
 if(!r.ok)throw Error(`LIVE ${path.split('?')[0]} failed (${r.status}).`);
 return r.json() as Promise<Record<string,any>>;
}
const session=await request('/api/auth/demo',{});token=session.access_token;
if(!token)throw Error('Demo login returned no session.');
let me=await request('/api/me?edition_id=ED-2026-DEMO');
if(me.member_id!=='SIM-LEAD'||me.verified_by_server!==true)throw Error('Refusing to alter an unexpected identity.');
const required=['coordination_lead','admin','finance_collections'];
const missing=required.filter(r=>!me.roles.includes(r));
if(missing.length&&process.argv.includes('--prepare')){
 if(!me.roles.some((r:string)=>['coordination_lead','admin'].includes(r)))throw Error('An existing administrator must assign reviewer roles. No authorization bypass is allowed.');
 for(const role of missing)await request('/api/team/roles',{member_id:'SIM-LEAD',edition_id:'ED-2026-DEMO',record_class:'simulated',role});
 me=await request('/api/me?edition_id=ED-2026-DEMO');
}
if(required.some(r=>!me.roles.includes(r)))throw Error('Reviewer requires coordination lead, administrator and finance roles in the demo edition.');
const version=await request('/api/version');
const campaigns=await request('/api/campaigns?edition_id=ED-2026-DEMO&record_class=simulated');
console.log('[LIVE] Server-verified reviewer identity: SIM-LEAD; highest combined operational, admin and finance roles verified in ED-2026-DEMO.');
console.log('[LIVE] Version endpoint and campaign reads passed. No model calls or finance/operational record writes. Missing reviewer roles assigned through the existing audited role endpoint:',missing.length);
