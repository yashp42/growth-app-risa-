import assert from 'node:assert/strict';
import test from 'node:test';
import { operationalIntent, answerOperational } from '../server/llm/operationalAnswers.ts';
import { financialIntent } from '../server/llm/financialAnswers.ts';
import { querySponsorMetrics } from '../server/llm/sponsorMetrics.ts';
import { createToolAccumulator } from '../server/llm/tools.ts';
import { verifyAnswerNumbers } from '../server/llm/answerCheck.ts';
import { buildAnswerBlocks } from '../server/llm/answerBlocks.ts';
import { answerStrategy } from '../server/llm/strategyAnswers.ts';
import { morphologicalRank as lexicalRank } from '../server/llm/lexicalSearchCandidate.ts';
const groups:Record<string,string[]>={
 'M-01':['Which sponsor paid us the most?','Who paid us most?','What is the highest amount that we got from a sponsor?','Who is our biggest contributor by cash received?','Which specific sponsor has given the highest amount of money?','Show cash collected by sponsor','Which company brought in the most cash?'],
 'M-02':['Which sponsor has the largest signed commitment?','Which company has the biggest signed sponsorship deal?','Top sponsors by signed value'],
 'M-03':['Which sponsor has the highest signed cash commitment?','Show signed cash per sponsor'],
 'M-04':['Which sponsor has the largest in-kind commitment?','Top sponsors by non-cash commitments'],
 'M-07':['Which sponsor owes us the most?','Who owes the most?','Which sponsor has the largest unpaid balance?','Top sponsors by outstanding cash'],
};
for(const [metric,questions] of Object.entries(groups))for(const q of questions)test('[MOCKED] sponsor-grain paraphrase: '+q,()=>assert.deepEqual(operationalIntent(q),{kind:'sponsor_ranking',metric}));
test('[MOCKED] ambiguous money asks a useful clarification; context resolves a short sponsor follow-up',()=>{
 assert.deepEqual(operationalIntent('Which sponsor is giving us the highest amount of money?'),{kind:'clarify_money'});
 assert.deepEqual(operationalIntent('From where have we got the highest amount of money?',false,'Which sponsor has paid the most?'),{kind:'sponsor_ranking',metric:'M-01'});
 for(const q of ['Which campaign collected the most cash?','Why did sponsor renewals fail?','Create a task for the biggest sponsor','Which sponsor is most likely to sign?','How much cash has Ather collected?','How much cash have we collected from Ather?','Which sponsor made the largest single payment?','Which sponsor paid most in 2025?','Top companies for outreach' ])assert.equal(operationalIntent(q),null);
 assert.equal(operationalIntent('Which sponsor paid the most?',true),null);
});
test('[MOCKED] descriptive wording about marking balances does not suppress cash analysis, while real write verbs do',()=>{
 const q='Reconcile signed value, cash collected and outstanding; keep in-kind separate and mark balances that cannot be ranked for urgency.';
 assert.equal(financialIntent(q),'cash_position');
 assert.equal(financialIntent('Mark the outstanding receipt as paid.'),null);
 assert.notEqual(financialIntent('Compare the cash schedule and due dates for outstanding balances.'),null);
});
test('[MOCKED] changed source figures, ties and own scope remain grounded without a model',async()=>{
 const acc=createToolAccumulator();const payload={source:'list_sponsor_metrics',kind:'sponsor_metrics',computable:true,scope:'own',data_version:91,rows:[{sponsor_name:'Changed A',value:703210,position:1},{sponsor_name:'Changed B',value:703210,position:1}]};
 const calls:string[]=[];const answer=await answerOperational({kind:'sponsor_ranking',metric:'M-01'},async(name)=>{calls.push(name);acc.toolResults.push(payload);return payload;},acc);
 assert.deepEqual(calls,['get_sponsor_metrics']);assert.match(answer,/Changed A, Changed B/);assert.match(answer,/₹7,03,210/);assert.match(answer,/tied/);assert.match(answer,/visible to your role/);assert.equal(verifyAnswerNumbers(answer,{toolResults:acc.toolResults,knowledgeTexts:[],userQuestion:''}).passed,true);
 const blocks=buildAnswerBlocks({toolResults:[payload],metricResults:[],choice:'table'});assert.equal(blocks[0].type,'table');if(blocks[0].type==='table'){assert.deepEqual(blocks[0].columns.map(c=>c.key),['position','sponsor_name','value']);assert.equal(blocks[0].rows[0].value,703210);}
});
test('[MOCKED] answer grounding accepts only recomputable same-metric cross-edition rate differences',()=>{
 const result=(edition_id:string,numerator:number,denominator:number)=>({source:'metrics.get_metric',edition_id,record_class:edition_id==='ED-2025'?'historical_synthetic':'simulated',rows:[{metric_id:'M-11',numerator,denominator,value:numerator/denominator,computable:true,unit:'ratio',applied_filters:{channel_group:'warm'}}]});
 const bundle={toolResults:[result('ED-2025',23,27),result('ED-2026-DEMO',18,22)],knowledgeTexts:[],userQuestion:''};
 assert.equal(verifyAnswerNumbers('Warm changed by 3.4 percentage points.',bundle).passed,true);
 assert.equal(verifyAnswerNumbers('Warm changed by 7.0 percentage points.',bundle).passed,false);
 const mismatched={toolResults:[result('ED-2025',23,27),{...result('ED-2026-DEMO',18,22),rows:[{...result('ED-2026-DEMO',18,22).rows[0],applied_filters:{channel_group:'inbound'}}]}],knowledgeTexts:[],userQuestion:''};
 assert.equal(verifyAnswerNumbers('Warm changed by 3.4 percentage points.',mismatched).passed,false);
});
test('[MOCKED] D-010 evaluation normalizes rule bands and withholds status below the approved sample gate',async()=>{
 const acc=createToolAccumulator();
 const rules=[
  {bet_id:'B1',rule_id:'EX-B1a',metric_id:'M-19',kpi_name:'Timely proposal rate',sample_size:'decision at n ≥ 12',current_value:.6,current_numerator:3,current_denominator:5,computable:true,band:'escalate',status_label:'escalate (< 0.63)',keep_if:'≥ 80%',change_if:'63–80%',escalate_if:'< 63%',evaluate_at:'End of W4',response:'Escalate'},
  {bet_id:'B2',rule_id:'EX-B2',metric_id:'M-25',kpi_name:'Advance within seven days',sample_size:'10 deals',current_value:.44,current_numerator:4,current_denominator:9,computable:true,band:'escalate',status_label:'escalate (< 0.74)',keep_if:'≥ 85%',change_if:'74–85%',escalate_if:'< 74%',evaluate_at:'7 days after signing',response:'Escalate'},
  {bet_id:'B3',rule_id:'EX-B3a',metric_id:'M-29',kpi_name:'Committed introductions',sample_size:'Count of committed introductions',current_value:9,current_numerator:9,current_denominator:null,computable:true,band:'change',status_label:'change (6–11)',keep_if:'≥ 12',change_if:'6–11',escalate_if:'< 6',evaluate_at:'End of W2',response:'Work every introduction'},
  {bet_id:'B4',rule_id:'EX-B4a',metric_id:'M-28',kpi_name:'Renewal interest',sample_size:'24 calls',current_value:8,current_numerator:8,current_denominator:24,computable:true,band:'keep',status_label:'keep',keep_if:'≥ 8 of 24',change_if:'4–7',escalate_if:'< 4',evaluate_at:'End of W2',response:'Keep the cycle'},
  {bet_id:'B5',rule_id:'EX-B5 price',metric_id:'M-31',kpi_name:'Realised ÷ asking price',sample_size:'first two deals',current_value:null,current_numerator:null,current_denominator:null,computable:false,band:'unavailable',status_label:'Metric unavailable',keep_if:'≥ 0.6',change_if:'< 0.6 on first two deals',escalate_if:'—',evaluate_at:'First two deals',reason:'No deals yet',response:'Repackage'},
 ];
 const answer=await answerStrategy('growth_bets',async()=>({rules:rules.map(r=>({...r,decision_id:'D-010'}))}),acc);
 for(const name of ['Fix the funnel (B1)','Cash discipline (B2)','Gated VC/alumni introductions (B3)','Warm flywheel (B4)','Pre-season premium inventory (B5)'])assert.match(answer,new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.match(answer,/not yet evaluable \(escalate/);assert.match(answer,/sample n ≥ 12; observed 5/);assert.match(answer,/intervene \(change/);assert.match(answer,/continue \(keep/);assert.match(answer,/not yet evaluable \(Metric unavailable/);
});
const context=(roles:any[],query:any)=>({roles,pool:{query},actorMemberId:'MEMBER-TEST',defaultEditionId:'ED-2026-DEMO',userSeason:{editionId:'ED-2026-DEMO',recordClass:'simulated' as const,asOf:'2026-11-17'}});
test('[MOCKED] sponsor ranking uses canonical receipt timing and ranks the whole cohort before LIMIT',async()=>{
 let called=false;const ctx=context(['coordination_lead'],async(sql:string,params:unknown[])=>{called=true;assert.match(sql,/r.reconciled_at < metrics.eod/);assert.match(sql,/r.received_at < LEAST\(metrics.edition_start/);assert.match(sql,/NOT ra.is_deleted/);assert.match(sql,/DENSE_RANK\(\) OVER/);assert.match(sql,/metrics.get_metric/);assert.equal(params[2],'2026-11-17');assert.equal(params[6],25);return {rows:[{sponsor_id:'S1',sponsor_name:'A',value:'120000',position:'1',total_sponsors:'40',breakdown_total:'250000',canonical_total:'250000'}]};});
 const r=await querySponsorMetrics(ctx,'M-01',{},25);assert.equal(called,true);assert.equal(r.truncated,true);assert.equal(r.rows[0].value,120000);
});
test('[MOCKED] mismatched canonical totals are withheld; viewer cannot execute financial ranking',async()=>{
 await assert.rejects(()=>querySponsorMetrics(context(['coordination_lead'],async()=>({rows:[{value:500,breakdown_total:500,canonical_total:600}]})),'M-01',{},25),/does not reconcile/);
 let queried=false;await assert.rejects(()=>querySponsorMetrics(context(['viewer'],async()=>{queried=true;return {rows:[]};}),'M-01',{},25),/does not permit/);assert.equal(queried,false);
});
test('[MOCKED] historical receipt absence is unknown, not zero; no receipt query executes',async()=>{
 const ctx=context(['coordination_lead'],async()=>{throw Error('must not query receipts');});ctx.userSeason={editionId:'ED-2025',recordClass:'historical_synthetic' as any,asOf:'2025-04-20'};
 const r=await querySponsorMetrics(ctx,'M-01',{},25);assert.equal(r.computable,false);assert.match(r.reason??'',/no receipt ledger/);
});
test('[MOCKED] enriched retrieval associates natural handoff and payment wording with specific evidence',()=>{
 const rows=[{chunk_id:'GENERAL',document_title:'Sponsor overview',section:'Summary',text:'General sponsorship overview and plan',base_rank:9},{chunk_id:'PROCESS',document_title:'Qualification handover',section:'Lead leakage',text:'Qualified leads did not receive opportunities. Handoff SLA is a response, not proof of causality.',base_rank:0},{chunk_id:'FINANCE',document_title:'Receipts',section:'Collections',text:'Only reconciled and allocated receipts count as collected cash.',base_rank:0}];
 assert.equal(lexicalRank('What causes qualified leads to leak during the handover?',rows)[0].chunk_id,'PROCESS');assert.equal(lexicalRank('Which collections are allocated and reconciled?',rows)[0].chunk_id,'FINANCE');
});
