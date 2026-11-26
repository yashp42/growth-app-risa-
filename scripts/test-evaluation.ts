import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsv } from './lib/retrievalMetrics.ts';
import { readFileSync } from 'node:fs';
import { selectCases, evaluationSummary, runEvaluationCases, scoreAnswer, type EvaluationRun } from '../server/evaluation.ts';
const cases=parseCsv(readFileSync(new URL('../eval/chatbot_test_bank.csv',import.meta.url),'utf8'));
const extra=parseCsv(readFileSync(new URL('../eval/stage4_extra_cases.csv',import.meta.url),'utf8'));
function run(ids:string[]):EvaluationRun{return {label:'LIVE',set:'gate',state:'running',started_at:'now',updated_at:'now',current_case:null,results:[],conversations:{},requests_used:0,remaining:ids};}
const simple={test_id:'TEST',category:'Permissions',user_query:'Delete data',route:'refuse',expected_tool_or_query:'none (decline)',expected_answer_criteria:'Declines',reference_answer:'Cannot delete',expected_citation:'',required_caveat:'-',test_setup:'',follow_up_of:'',must_not_cite:''};

test('[MOCKED] gate set includes dependencies, critical categories, reference additions and eight extras',()=>{
  assert.equal(cases.length,66);assert.equal(extra.length,8);
  const chosen=selectCases([...cases,...extra],'gate');assert.ok(chosen.some(c=>c.test_id==='T-14'));assert.ok(chosen.some(c=>c.test_id==='X-08'));
  const ordered=selectCases([{...simple,test_id:'B',follow_up_of:'A'},{...simple,test_id:'A'}],'full');assert.deepEqual(ordered.map(c=>c.test_id),['A','B']);
});
test('[MOCKED] missing/unsupported numeric output and forbidden citations fail scoring',()=>{
  const result=scoreAnswer({...simple,must_not_cite:'KB-02.1'},{route:'refuse',answer:'Cannot delete [KB-02.1]',answer_check_passed:false,citations:[{id:'KB-02.1'}]},true,1);
  assert.equal(result.status,'FAIL');assert.ok(result.reasons.some(r=>r.includes('Forbidden')));
  assert.equal(scoreAnswer(simple,{route:'refuse',answer:'Cannot delete',answer_check_passed:true,actions:[{}]},true,1).status,'FAIL');
});
test('[MOCKED] proposals are cleaned up, operational snapshot unchanged, follow-ups share conversation',async()=>{
  const state=run(['A','B']);const conversations:Array<string|undefined>=[];let cleanups=0;
  await runEvaluationCases([{...simple,test_id:'A'},{...simple,test_id:'B',follow_up_of:'A'}],state,{
    ask:async(_c,conversation)=>{conversations.push(conversation);return {status:200,body:{route:'refuse',answer:'Cannot delete',answer_check_passed:true,conversation_id:'AIC-TEST',token_usage:{model_requests:1}}};},
    snapshot:async()=>'unchanged',cleanup:async()=>{cleanups++;return true;},persist:()=>{},
  });
  assert.equal(state.state,'completed');assert.deepEqual(conversations,[undefined,'AIC-TEST']);assert.equal(cleanups,2);assert.equal(state.requests_used,2);
});
test('[MOCKED] rate limit checkpoints, resumes, and never retries a case more than once',async()=>{
  const state=run(['TEST']);let asks=0;
  const deps={ask:async()=>{asks++;return {status:429,body:{},retryAfter:3600};},snapshot:async()=>'same',cleanup:async()=>true,persist:()=>{}};
  await runEvaluationCases([simple],state,deps);assert.equal(state.state,'paused');assert.deepEqual(state.remaining,['TEST']);assert.equal(state.retry_after_seconds,3600);
  await runEvaluationCases([simple],state,deps);await runEvaluationCases([simple],state,deps);
  assert.equal(asks,2);assert.equal(state.results.length,0);assert.equal(state.state,'paused');assert.deepEqual(state.remaining,['TEST']);
});
test('[MOCKED] a cleanup failure stops the run before another case; it is never accepted as passing',async()=>{
  const state=run(['A','B']);let asks=0;
  await runEvaluationCases([{...simple,test_id:'A'},{...simple,test_id:'B'}],state,{ask:async()=>{asks++;return {status:200,body:{}};},snapshot:async()=>'same',cleanup:async()=>false,persist:()=>{}});
  assert.equal(asks,1);assert.equal(state.state,'error');assert.equal(evaluationSummary(state).release_gates_met,false);
});
test('[MOCKED] isolated-fixture cases are NEEDS_HUMAN and do not touch the shared database',async()=>{
  const state=run(['TEST']);await runEvaluationCases([{...simple,test_setup:'Copy database and insert test records'}],state,{ask:async()=>{throw Error('must not ask');},snapshot:async()=>{throw Error('must not query');},cleanup:async()=>false,persist:()=>{}});
  assert.equal(state.results[0].status,'NEEDS_HUMAN');assert.equal(state.results[0].attempts,0);
});
test('[MOCKED] partial/gate-only runs never satisfy overall release gates',()=>{
  const state=run(['NOT_RUN']);state.results=[{test_id:'TEST',category:'Permissions',status:'PASS',reasons:[],answer:'',attempts:1,model_requests:0}];
  assert.equal(evaluationSummary(state).pass_rate,0.5);assert.equal(evaluationSummary(state).release_gates_met,false);
});
import { caseEdition } from '../server/evaluation.ts';
test('[MOCKED] reference and future-scenario questions use demo context; historical analytics stay in 2025',()=>{
  assert.equal(caseEdition({...simple,category:'Financial interpretation',user_query:'What are the chances of collecting 30 lakh?'}),'ED-2026-DEMO');
  assert.equal(caseEdition({...simple,category:'Basic analytics',user_query:'How many partnerships were confirmed?'}),'ED-2025');
  assert.equal(caseEdition({...simple,user_query:'How much was signed in 2025?'}),'ED-2025');
});
test('[MOCKED] provider-degraded HTTP 200 pauses the case instead of recording a false answer failure',async()=>{
  const state=run(['TEST']);await runEvaluationCases([simple],state,{ask:async()=>({status:200,body:{generation_fallback_reason:'unavailable',token_usage:{model_requests:1}}}),snapshot:async()=>'same',cleanup:async()=>true,persist:()=>{}});
  assert.equal(state.state,'paused');assert.equal(state.results.length,0);assert.deepEqual(state.remaining,['TEST']);
});
test('[MOCKED] unknown action fixture is flagged for human review; it is never counted as a pass',()=>{
  const result=scoreAnswer({...simple,route:'action'},{route:'action',answer:'Please clarify: no matching sponsor found.',answer_check_passed:true,actions:[]},true,1);
  assert.equal(result.status,'NEEDS_HUMAN');
});

import { reportMarkdown } from '../server/evaluation.ts';
test('[MOCKED] paused case diagnostics survive reporting without scoring an unavailable provider',async()=>{
 const state=run(['TEST']);await runEvaluationCases([simple],state,{ask:async()=>({status:503,body:{error:{code:'AI_UNAVAILABLE',message:'Free models unavailable'}}}),snapshot:async()=>'same',cleanup:async()=>true,persist:()=>{}});
 assert.equal(state.paused_case?.test_id,'TEST');assert.equal(state.results.length,0);assert.match(reportMarkdown(state),/AI_UNAVAILABLE/);assert.match(reportMarkdown(state),/Paused case: TEST; HTTP 503/);
});

test('[MOCKED] document-level KB citations accept a retrieved child chunk while unrelated documents still fail',()=>{
 const c={...simple,expected_citation:'KB-07'};
 assert.equal(scoreAnswer(c,{route:'refuse',answer:'Cannot delete',answer_check_passed:true,citations:[{id:'KB-07.3'}]},true,1).status,'PASS');
 assert.equal(scoreAnswer(c,{route:'refuse',answer:'Cannot delete',answer_check_passed:true,citations:[{id:'KB-08.3'}]},true,1).status,'FAIL');
});
test('[MOCKED] receipt-free reference assumptions conflict with populated current demo data and require review',()=>{
 const c={...simple,route:'hybrid',expected_answer_criteria:'No cash has been recorded as collected (no payment data)',reference_answer:'No recorded cash',expected_tool_or_query:'get_metric(M-01)',expected_citation:'M-01'};
 const body={route:'hybrid',answer:'Current collected cash is ₹400 [M-01]; forecast is not actual.',answer_check_passed:true,citations:[{id:'M-01'}],tool_calls:[{tool_name:'get_metric',status:'ok'}],metric_results:[{metric_id:'M-01',computable:true,value:400}]};
 const result=scoreAnswer(c,body,true,1);assert.equal(result.status,'NEEDS_HUMAN');assert.ok(result.reasons.some(r=>r.includes('Fixture assumes no receipts')));
 const broken=scoreAnswer(c,{...body,answer_check_passed:false},true,1);assert.equal(broken.status,'FAIL');
});
