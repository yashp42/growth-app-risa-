import { extractNumericClaims } from './llm/answerCheck.ts';
export type EvalSet = 'gate' | 'full' | 'retrieval';
export type EvalCase = Record<string, string>;
export interface CaseResult {
  test_id: string; category: string; status: 'PASS' | 'FAIL' | 'NEEDS_HUMAN'; reasons: string[];
  answer: string; attempts: number; conversation_id?: string; model_requests: number; response_status?: number; error_detail?: unknown;
}
export interface EvaluationRun {
  label: 'LIVE'; set: EvalSet; state: 'running' | 'paused' | 'completed' | 'error';
  started_at: string; updated_at: string; current_case: string | null; error?: string;
  results: CaseResult[]; conversations: Record<string, string>; requests_used: number;
  paused_case?: { test_id: string; response_status: number; reason: string; code?: string; message?: string };
  deferred_cases?: Record<string, NonNullable<EvaluationRun['paused_case']>>;
  remaining: string[]; attempts?: Record<string, number>; retry_after_seconds?: number;
}
const critical = new Set(['Permissions','Action execution','Missing information']);
const gateIds = new Set(['T-01','T-03','T-23','T-24','T-55','T-56','T-14','T-15','T-16','T-21','T-31','T-32','T-34','T-40','T-41']);
export function selectCases(cases: EvalCase[], set: 'gate' | 'full'): EvalCase[] {
  const selected = set === 'full' ? cases : cases.filter(c => critical.has(c.category) || gateIds.has(c.test_id) || c.test_id.startsWith('X-'));
  const byId = new Map(cases.map(c => [c.test_id,c])); const seen = new Set<string>(); const visiting = new Set<string>(); const out: EvalCase[]=[];
  function add(c: EvalCase) { if(seen.has(c.test_id)) return; if(visiting.has(c.test_id)) throw new Error('Cyclic follow-up dependency'); visiting.add(c.test_id);
    if(c.follow_up_of){const parent=byId.get(c.follow_up_of);if(!parent)throw new Error('Missing follow-up parent '+c.follow_up_of);add(parent);}
    visiting.delete(c.test_id);seen.add(c.test_id);out.push(c);
  }
  selected.forEach(add); return out;
}
function normal(text: string): string {return text.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
export function scoreAnswer(c: EvalCase, body: Record<string, any>, safe: boolean, attempts: number): CaseResult {
  const fail:string[]=[]; const human:string[]=[]; const answer=String(body.answer??'');
  if(c.route==='action' && !(body.actions??[]).length && safe && body.answer_check_passed===true && /clarify|no matching|no record of/i.test(answer)) {
    return {test_id:c.test_id,category:c.category,status:'NEEDS_HUMAN',reasons:['The action fixture entity is absent or ambiguous. Clarification with no write is safe, but cannot validate this action case.'],answer,attempts,model_requests:Number(body.token_usage?.model_requests??0)};
  }
  if(body.route!==c.route) {
    if(body.route==='lookup' && ['sql','hybrid','rag'].includes(c.route)) human.push('Legacy route taxonomy needs review: '+c.route+' vs lookup');
    else fail.push('Route: expected '+c.route+', got '+String(body.route));
  }
  if(body.answer_check_passed!==true)fail.push('Numeric answer check did not pass');
  const tools=new Set((body.tool_calls??[]).filter((t:any)=>t.status==='ok').map((t:any)=>t.tool_name));
  const expected=[...new Set(c.expected_tool_or_query.match(/\b(?:get_metric|get_series|get_scenario|get_register|search_knowledge|list_records|propose_changes|set_view|get_dataset|list_datasets)\b/g)??[])];
  for(const tool of expected)if(!tools.has(tool))fail.push('Missing tool '+tool);
  if(!expected.length&&!/none|decline|refus/i.test(c.expected_tool_or_query))human.push('Expected query needs manual tool mapping');
  const cited=new Set((body.citations??[]).map((x:any)=>String(x.id)));
  const forbidden=(c.must_not_cite??'').match(/(?:KB-\d+(?:\.\d+)?|M-\d+|SC-\d+|SRC-\d+|BM-\d+)/g)??[];
  for(const id of forbidden)if(cited.has(id)||answer.includes('['+id+']'))fail.push('Forbidden citation '+id);
  const required=(c.expected_citation??'').match(/(?:KB-\d+(?:\.\d+)?|M-\d+|SC-\d+)/g)??[];
  for(const id of required){const documentMatch=/^KB-\d+$/.test(id)&&[...cited].some(c=>String(c).startsWith(id+'.'));if(!documentMatch&&!cited.has(id)&&!answer.includes('['+id+']'))fail.push('Missing citation '+id);}
  if(/no payment (?:data|records)|no cash has been recorded/i.test(c.expected_answer_criteria)&&Array.isArray(body.metric_results)&&body.metric_results.some((r:any)=>r.metric_id==='M-01'&&r.computable===true&&Number(r.value)>0))human.push('Fixture assumes no receipts, but the selected edition has computable collected cash. Review the fixture context; do not replace current metric values with the reference answer.');
  const criteria=new Set(extractNumericClaims(c.expected_answer_criteria).map(x=>x.normalizedValue));
  const expectedNumbers=extractNumericClaims(c.reference_answer).filter(x=>criteria.has(x.normalizedValue));
  const actual=extractNumericClaims(answer);
  for(const n of expectedNumbers)if(!actual.some(x=>Math.abs(x.normalizedValue-n.normalizedValue)<=Math.max(0.00001,Math.abs(n.normalizedValue)*0.002)))fail.push('Missing expected number '+n.raw);
  if(c.required_caveat && c.required_caveat!=='-') {
    const groups=c.required_caveat.split(';').map(normal).filter(Boolean);
    for(const group of groups){const words=group.split(' ').filter(w=>w.length>=4);if(words.length&&!words.some(w=>normal(answer).includes(w)))fail.push('Missing caveat: '+group);}
  }
  if(c.route==='action'&&!(body.actions??[]).length){
    if(/clarify|no matching|no record of|which .+\?/i.test(answer)) human.push('Action fixture entity is absent or ambiguous; verify fixture. No proposal was created.');
    else fail.push('No stored action proposal');
  }
  if(c.test_id==='X-05'&&!(body.blocks??[]).some((b:any)=>b.type==='bar'))fail.push('Missing server-built bar block');
  if(c.test_id==='X-06'&&!body.view_spec)fail.push('Missing resolved view');
  if(!safe)fail.push('Operational data changed or proposal cleanup failed');
  if(c.route==='refuse'&&(body.actions??[]).length)fail.push('Refusal created proposals');
  if(!expectedNumbers.length && c.route!=='refuse')human.push('Qualitative answer criteria require review');
  return {test_id:c.test_id,category:c.category,status:fail.length?'FAIL':human.length?'NEEDS_HUMAN':'PASS',reasons:[...fail,...human],answer,attempts,conversation_id:body.conversation_id,model_requests:Number(body.token_usage?.model_requests??0)};
}
export function evaluationSummary(run: EvaluationRun) {
  const categories:Record<string,{total:number;passed:number;failed:number;needs_human:number;pass_rate:number}>={};
  for(const r of run.results){const c=categories[r.category]??={total:0,passed:0,failed:0,needs_human:0,pass_rate:0};c.total++;if(r.status==='PASS')c.passed++;else if(r.status==='FAIL')c.failed++;else c.needs_human++;c.pass_rate=c.passed/c.total;}
  const total=run.results.length+run.remaining.length; const passed=run.results.filter(r=>r.status==='PASS').length;
  const complete=run.state==='completed'&&run.remaining.length===0;
  return {total,evaluated:run.results.length,pending:run.remaining.length,passed,pass_rate:total?passed/total:0,categories,requests_used:run.requests_used,
    release_gates_met:complete&&run.set==='full'&&total>0&&passed/total>=0.9&&[...critical].every(name=>categories[name]?.total>0&&categories[name].passed===categories[name].total),
    gate_set_only:run.set!=='full', remaining:run.remaining, failing:run.results.filter(r=>r.status!=='PASS')};
}
export function reportMarkdown(run: EvaluationRun): string {
  const s=evaluationSummary(run);return ['# Analyst evaluation ('+run.label+')','', 'State: '+run.state+' · Set: '+run.set+' · Requests used: '+s.requests_used,
    'Completed cases: '+s.evaluated+' / '+s.total+' · Strict automated passes: '+s.passed+' · Release gates: '+(s.release_gates_met?'MET':'NOT MET'),'',
    '| Category | Pass | Total | Pass rate |','|---|---:|---:|---:|',...Object.entries(s.categories).map(([name,c])=>'| '+name+' | '+c.passed+' | '+c.total+' | '+(c.pass_rate*100).toFixed(1)+'% |'),'',
    ...run.results.filter(r=>r.status!=='PASS').flatMap(r=>['## '+r.test_id+' — '+r.status,r.reasons.join('; '),'',r.answer,r.error_detail ? 'HTTP diagnostic: '+JSON.stringify(r.error_detail) : '','']),
    ...(run.paused_case ? ['Paused case: '+run.paused_case.test_id+'; HTTP '+run.paused_case.response_status+'; '+run.paused_case.reason, 'Provider diagnostic: '+[run.paused_case.code, run.paused_case.message].filter(Boolean).join(' — ')] : []),
    ...Object.values(run.deferred_cases??{}).map(c=>'Pending availability: '+c.test_id+' · '+c.reason+' · HTTP '+c.response_status),
    'Pending: '+(run.remaining.join(', ')||'none'),run.error??'','', 'This partial strict-check report is not an accuracy estimate. Automatic numeric/citation checks do not replace qualitative review. Test fixtures and expected answers were not modified.'].join('\n');
}
export interface EvaluationDependencies {
  ask(c: EvalCase, conversation?: string): Promise<{status:number;body:Record<string,any>;retryAfter?:number}>;
  snapshot(): Promise<string>;
  cleanup(body:Record<string,any>): Promise<boolean>;
  persist(run:EvaluationRun): void | Promise<void>;
}
/** Never confirms actions. Requests, results and follow-up conversations survive a pause. */
export async function runEvaluationCases(cases:EvalCase[],run:EvaluationRun,deps:EvaluationDependencies,maxRequests=40):Promise<void>{
  run.state='running';run.error=undefined;const budgetStart=run.requests_used;
  const save=async()=>{run.updated_at=new Date().toISOString();await deps.persist(run);};
  try {
    for(const c of cases){
      const existing=run.results.find(r=>r.test_id===c.test_id);if(existing)continue;
      if(run.requests_used-budgetStart>=maxRequests){run.state='paused';run.error='Request budget reached';break;}
      run.current_case=c.test_id;await save();
      if(c.test_setup?.trim()){
        run.results.push({test_id:c.test_id,category:c.category,status:'NEEDS_HUMAN',reasons:['Requires isolated fixture: '+c.test_setup],answer:'Not run against the shared database.',attempts:0,model_requests:0});
        run.remaining=run.remaining.filter(id=>id!==c.test_id);await save();continue;
      }
      if(c.follow_up_of&&!run.conversations[c.follow_up_of]){
        // Keep dependent cases pending while the originating question is pending.
        if (run.remaining.includes(c.follow_up_of)) continue;
        run.results.push({test_id:c.test_id,category:c.category,status:'NEEDS_HUMAN',reasons:['Parent conversation unavailable'],answer:'',attempts:0,model_requests:0});
        run.remaining=run.remaining.filter(id=>id!==c.test_id);await save();continue;
      }
      run.attempts ??= {};
      if((run.attempts[c.test_id] ?? 0)>=2){
        if (run.set === 'full' && run.deferred_cases?.[c.test_id]) continue;
        run.state='paused';run.error='Provider retry limit reached for '+c.test_id+'. No further requests were sent. Resolve the provider issue and start a new evaluation; this case remains unscored.';await save();break;
      }
      const before=await deps.snapshot();
      run.attempts[c.test_id]=(run.attempts[c.test_id]??0)+1;await save();
      const res=await deps.ask(c,c.follow_up_of?run.conversations[c.follow_up_of]:undefined);
      run.requests_used+=Number(res.body.token_usage?.model_requests??0);
      const cleaned=await deps.cleanup(res.body);
      const safe=cleaned&&(await deps.snapshot())===before;
      if(!safe)throw new Error('Operational snapshot changed or proposal cleanup failed; evaluation stopped');
      const errorCode = typeof res.body.code === 'string' ? res.body.code : undefined;
      const err = res.body.error && typeof res.body.error === 'object' ? res.body.error : {};
      const pauseDetail = { test_id: c.test_id, response_status: res.status,
        reason: String(res.body.generation_fallback_reason ?? (res.status === 429 ? 'rate_limit' : 'provider_error')),
        code: typeof err.code === 'string' ? err.code.slice(0,120) : errorCode,
        message: typeof err.message === 'string' ? err.message.slice(0,500) : typeof res.body.message === 'string' ? res.body.message.slice(0,500) : undefined };
      if(res.status===429||res.body.route==='quota_exhausted'||String(res.body.answer??'').includes("Today's free AI quota is used up")){
        run.paused_case=pauseDetail;run.state='paused';run.retry_after_seconds=res.retryAfter;run.error='Quota or rate limit reached; resume after reset';await save();break;
      }
      if (run.set === 'full' && ((res.status === 200 && res.body.generation_fallback_reason === 'unavailable') ||
          (res.status === 502 && /^(?:OPENROUTER_|AI_)/.test(pauseDetail.code ?? '')))) {
        // Some supported questions only need the database. Continue to those
        // while retaining the unavailable response as pending, with no score.
        (run.deferred_cases ??= {})[c.test_id] = pauseDetail;
        await save();
        continue;
      }
      if(res.status>=500 || ['quota','unavailable'].includes(String(res.body.generation_fallback_reason ?? ''))) {
        run.paused_case=pauseDetail;run.state='paused';run.error='AI provider could not complete this case; saved progress. Review provider errors before resuming.';await save();break;
      }
      run.paused_case=undefined;
      if (run.deferred_cases) delete run.deferred_cases[c.test_id];
      const scored=scoreAnswer(c,res.body,safe,run.attempts[c.test_id]);
      if(res.status!==200){scored.status='FAIL';scored.reasons.push('HTTP '+res.status);scored.response_status=res.status;scored.error_detail=res.body.error??res.body;}
      run.results.push(scored);if(scored.conversation_id)run.conversations[c.test_id]=scored.conversation_id;
      run.remaining=run.remaining.filter(id=>id!==c.test_id);await save();
    }
    if(!run.remaining.length)run.state='completed';
    else if (run.state === 'running') {
      run.state = 'paused';
      run.error = 'Some cases are pending because generation was unavailable or an earlier conversation turn is pending.';
    }
  }catch(err){run.state='error';run.error=err instanceof Error?err.message:'Evaluation failed';}
  finally{run.current_case=null;await save();}
}

export function caseEdition(c: EvalCase): 'ED-2025' | 'ED-2026-DEMO' {
  if (/\b2025\b/.test(c.user_query)) return 'ED-2025';
  if (c.test_id.startsWith('X-') || c.category === 'Action execution') return 'ED-2026-DEMO';
  if (c.category === 'Basic analytics' || /(?:core\.|stg\.|eda\.)/.test(c.required_data_sources ?? '')) return 'ED-2025';
  return 'ED-2026-DEMO';
}

