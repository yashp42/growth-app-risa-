import { useEffect, useState } from 'react';
import { getAuthSession } from '../../services/authSession';
import { MarkdownAnswer } from '../analyst/MarkdownAnswer';
type SetName='gate'|'full'|'retrieval';
async function request(url:string,body?:unknown){
  const session=getAuthSession();if(!session)throw new Error('Sign in first');
  const response=await fetch('/api/admin/eval/'+url,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!response.ok)throw new Error('Evaluation request failed (HTTP '+response.status+')');
  return response.json();
}
export function EvaluationPanel(){
  const [set,setSet]=useState<SetName>('gate');const [status,setStatus]=useState<Record<string,any>>({state:'idle'});
  const [report,setReport]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let stopped=false;let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{try{const s=await request('status?set='+set);if(stopped)return;setStatus(s);
      if(s.state==='running')timer=setTimeout(poll,2500);
      else if(s.state!=='idle'){const r=await request('report?set='+set);if(!stopped)setReport(r.markdown??r.retrieval?.report??'Report not yet available');}
    }catch(e){if(!stopped)setError(e instanceof Error?e.message:'Evaluation unavailable');}};
    void poll();return()=>{stopped=true;clearTimeout(timer);};
  },[set,busy]);
  const start=async(resume=false)=>{setBusy(true);setError('');setReport('');try{await request('run',{set,resume});setStatus({state:'running'});}catch(e){setError(e instanceof Error?e.message:'Evaluation failed');}finally{setBusy(false);}};
  return <section className="rounded-md border border-[#D9D7D0] bg-white p-5">
    <h2 className="font-semibold">Run evaluation</h2>
    <p className="mt-1 text-sm text-[#525E58]">LIVE checks use the demo database. Analyst runs use free AI requests. Retrieval uses no AI requests. Proposed actions are inspected and cancelled.</p>
    <div className="my-3 flex flex-wrap gap-2">
      <label className="text-sm">Test set <select value={set} onChange={e=>setSet(e.target.value as SetName)} className="ml-2 rounded border p-1" disabled={busy||status.state==='running'}>
        <option value="gate">Gate set</option><option value="full">Full</option><option value="retrieval">Retrieval</option>
      </select></label>
      <button type="button" className="rounded bg-[#315F52] px-3 py-1 text-sm text-white disabled:opacity-50" disabled={busy||status.state==='running'} onClick={()=>void start()}>Run</button>
      {status.state==='paused'?<button type="button" className="rounded border px-3 py-1 text-sm" disabled={busy} onClick={()=>void start(true)}>Resume</button>:null}
    </div>
    <p role="status" className="text-sm">{status.state}{status.current_case?' · '+status.current_case:''}</p>
    {status.error?<p className="mt-2 text-sm">{status.error}</p>:null}
    {error?<p role="alert" className="mt-2 text-sm text-red-700">{error}</p>:null}
    {report?<div className="mt-4 max-h-[36rem] overflow-auto"><MarkdownAnswer>{report}</MarkdownAnswer></div>:null}
  </section>;
}
