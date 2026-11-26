/** LIVE: invokes the deployed admin runner; action proposals are never confirmed. */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const origin=process.env.EVAL_BASE_URL??'http://127.0.0.1:3000';
const set=process.argv.find(v=>v.startsWith('--set='))?.slice(6)??'gate';
if(!['gate','full','retrieval'].includes(set))throw new Error('Unknown set');
const login=await fetch(origin+'/api/auth/demo',{method:'POST'});
const session=await login.json() as {access_token?:string};
if(!login.ok||!session.access_token)throw new Error('Demo login failed');
const headers={Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'};
const start=await fetch(origin+'/api/admin/eval/run',{method:'POST',headers,body:JSON.stringify({set,resume:process.argv.includes('--resume')})});
if(!start.ok)throw new Error('Evaluation did not start: HTTP '+start.status+' '+await start.text());
let status:Record<string,unknown>={};
do{
  await new Promise(resolve=>setTimeout(resolve,3000));
  const response=await fetch(origin+'/api/admin/eval/status?set='+set,{headers});
  if(!response.ok)throw new Error('Status unavailable: HTTP '+response.status);
  status=await response.json() as Record<string,unknown>;
  console.log('[LIVE]',status.state,status.current_case??'',status.summary??'');
}while(status.state==='running');
const response=await fetch(origin+'/api/admin/eval/report?set='+set,{headers});
if(!response.ok)throw new Error('Report unavailable: HTTP '+response.status);
const report=await response.json() as {markdown?:string};
mkdirSync('eval/results',{recursive:true});const stem=path.join('eval/results',new Date().toISOString().replace(/[:.]/g,'-')+'-'+set);
writeFileSync(stem+'.json',JSON.stringify(report,null,2));if(report.markdown)writeFileSync(stem+'.md',report.markdown);
console.log('[LIVE] Saved report:',stem);
if(status.state!=='completed')process.exitCode=2;
