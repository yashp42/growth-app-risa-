import assert from 'node:assert/strict';
import test from 'node:test';
import { financialIntent, answerFinancial } from '../server/llm/financialAnswers.ts';
import { strategyIntent, strategyIntents, answerStrategy } from '../server/llm/strategyAnswers.ts';
import { basicAnalyticsIntent, answerBasicAnalytics } from '../server/llm/basicAnalytics.ts';
import { operationalIntent, answerOperational } from '../server/llm/operationalAnswers.ts';
import { verifyScopedAnswer } from '../server/llm/claimGrounding.ts';
import { createToolAccumulator } from '../server/llm/tools.ts';

test('[MOCKED] broad cash-position request is not reduced to one sponsor-ranking metric',async()=>{
 const q='Give me a complete picture of our current cash position. How much is signed, how much is cash-type signed value, how much has actually been collected and how much remains outstanding? Which sponsors account for the largest outstanding balances, and what should we follow up on first?';
 assert.equal(financialIntent(q),'cash_position');
 const acc=createToolAccumulator();const requested:string[]=[];
 const values:Record<string,number>={'M-02':500000,'M-03':400000,'M-01':200000,'M-07':150000};
 const answer=await answerFinancial('cash_position',async(name,args)=>{
  requested.push(name+':'+String(args.metric_id??''));
  if(name==='get_metric'){const out={rows:[{metric_id:args.metric_id,value:values[String(args.metric_id)],computable:true}]};acc.toolResults.push(out);return out;}
  if(name==='get_sponsor_metrics'){const out={computable:true,rows:[{sponsor_name:'Dynamic Sponsor',value:150000,position:1}]};acc.toolResults.push(out);return out;}
  return {};
 },acc);
 assert.deepEqual(requested.slice(0,4),['get_metric:M-02','get_metric:M-03','get_metric:M-01','get_metric:M-07']);
 assert.match(answer,/Dynamic Sponsor/);assert.match(answer,/not proof that an amount is late/);assert.match(answer,/in-kind/);
});

test('[MOCKED] cash-position sponsor amounts cite sponsor ranking evidence and pass answer grounding',async()=>{
 const q='Give me a complete picture of our current cash position. How much is signed, how much is cash-type signed value, how much has actually been collected and how much remains outstanding? Which sponsors account for the largest outstanding balances, and what should we follow up on first?';
 const acc=createToolAccumulator();
 const values:Record<string,number>={'M-02':990000,'M-03':965000,'M-01':272500,'M-07':692500};
 const answer=await answerFinancial('cash_position',async(name,args)=>{
  const id=String(args.metric_id??'');
  const out=name==='get_metric'?{source:'metrics.get_metric',edition_id:'ED-2026-DEMO',record_class:'simulated',as_of:'2026-11-27',rows:[{metric_id:id,value:values[id],computable:true,unit:'INR'}]}:{source:'list_sponsor_metrics',kind:'sponsor_metrics',metric_id:'M-07',edition_id:'ED-2026-DEMO',record_class:'simulated',as_of:'2026-11-27',rows:[{sponsor_name:'Rupeeroot',value:150000,position:1},{sponsor_name:'Mosaic Mobility',value:100000,position:2}]};
  acc.toolResults.push(out);return out;
 },acc);
 assert.match(answer,/sponsor_metrics:M-07/);
 const verification=verifyScopedAnswer(answer,{toolResults:acc.toolResults,knowledgeTexts:[],userQuestion:q},{editionId:'ED-2026-DEMO',recordClass:'simulated',asOf:'2026-11-27'});
 assert.equal(verification.passed,true,JSON.stringify(verification));
});

test('[MOCKED] D-010 bet answer evaluates rule snapshots and keeps missing bets unevaluated',async()=>{
 const q='Evaluate all five approved growth bets against their D-010 success and escalation thresholds using the latest available data.';
 assert.equal(strategyIntent(q),'growth_bets');
 const acc=createToolAccumulator();
 const answer=await answerStrategy('growth_bets',async()=>{
  const out={rules:[{decision_id:'D-010',bet_id:'B1',rule_id:'EX-B1a',kpi_name:'Handoff SLA',metric_id:'M-28',current_value:null,computable:false,reason:'Not enough observations',keep_if:'≥ 80%',change_if:'63–80%',escalate_if:'< 63%',evaluate_at:'End of W4',status_label:'Not computable'}]};acc.toolResults.push(out);return out;
 },acc);
 assert.match(answer,/Fix the funnel/);assert.match(answer,/Not enough observations/);assert.match(answer,/Cash discipline/);assert.match(answer,/Cannot evaluate/);
});

test('[MOCKED] capacity request recognises the approved 5 person-week plan',()=>{
 assert.equal(strategyIntent('We have limited team capacity. Based on current pipeline performance, cash potential, effort requirements and the approved scenarios, where should we allocate the next available 5 person-weeks?'),'capacity_allocation');
 const compound='Using the approved D-010 thresholds evaluate all five growth bets, then compare where the next 5 person-weeks could go. Do not change the approved D-009 or D-010 assumptions.';
 assert.deepEqual(strategyIntents(compound),['growth_bets','capacity_allocation']);
});
test('[MOCKED] strategy answer formats D-010 ratios and D-009 lakh units clearly',async()=>{
 const acc=createToolAccumulator();
 const answer=await answerStrategy('growth_bets',async()=>({rules:[{decision_id:'D-010',bet_id:'B2',rule_id:'EX-B2',metric_id:'M-25',kpi_name:'Advance payment rate',current_value:4/9,current_numerator:4,current_denominator:9,current_unit:'ratio',computable:true,band:'escalate',status_label:'escalate (< 0.74)',keep_if:'≥ 85%',change_if:'74–85%',escalate_if:'< 74%',evaluate_at:'10 deals',response:'Escalate'}]}),acc);
 assert.match(answer,/44\.4% \(sample 4\/9\)/);
 const capacity=await answerStrategy('capacity_allocation',async(name,args)=>{
  if(name==='get_scenario')return {scenarios:[{scenario_id:'SC-01',name:'Base',expected_cash:21.23}]};
  if(name==='get_dataset'&&args.dataset_id==='strategy.resource_allocation.scenario_capacity')return {columns:['Capacity in approved scenarios [C]','col_2','col_3','col_4','col_5','col_6','col_7','col_8','col_9','col_10','col_11'],rows:[{'Capacity in approved scenarios [C]':'BASE @50',col_2:50,col_3:24.9,col_4:31.2,col_5:25.1,col_6:.502,col_7:0,col_8:.021,col_9:21.23,col_10:21.06,col_11:.17}]};
  if(name==='get_dataset'&&args.dataset_id==='strategy.resource_allocation.bets')return {columns:['Bet effort and cash per person-week [C]','col_2','col_3','col_4','col_5','col_6','col_7','col_8','col_9'],rows:[{'Bet effort and cash per person-week [C]':'B2 Cash discipline',col_2:3.55,col_3:1.5,col_4:0,col_5:0,col_6:1.5,col_7:2.37,col_8:1,col_9:2}]};
  if(name==='get_metric')return {rows:[{computable:false,reason:'Unavailable'}]};
  return {available:false,chunks:[]};
 },acc);
 assert.match(capacity,/₹21\.23L/);assert.match(capacity,/2\.1%/);assert.match(capacity,/BASE @50 \| 50 \| 24\.9 \| 31\.2/);assert.match(capacity,/Retrieved D-010 priority order: B2 Cash discipline \(priority 2\)/);assert.doesNotMatch(capacity,/\*\*Approved capacity scenarios\*\* \| \|/);
});

test('[MOCKED] broad qualified-opportunity wording routes to campaign and channel leakage analysis',()=>{
 const q='Which campaigns and acquisition channels are losing the most qualified sponsorship opportunities before they become confirmed wins? Compare the stages using the correct counts and denominators, show the conversion rate for each comparable group, and identify where the largest number of qualified opportunities is being lost.';
 assert.equal(basicAnalyticsIntent(q),'campaign_leakage');
});

test('[MOCKED] combined cash position and due-date request composes both evidence sets',async()=>{
 const q='Reconcile signed value, signed cash, cash collected, and outstanding cash. For each balance show documented due dates and overdue status.';
 assert.equal(financialIntent(q),'cash_position');
 const acc=createToolAccumulator();const requested:string[]=[];
 const answer=await answerFinancial('cash_position',async(name,args)=>{
  requested.push(`${name}:${String(args.metric_id??args.kind??'')}`);
  if(name==='get_metric'){
   const id=String(args.metric_id),v:Record<string,number>={'M-02':110,'M-03':100,'M-04':10,'M-01':40,'M-07':60};
   const out={source:'metrics.get_metric',edition_id:'ED-2026-DEMO',record_class:'simulated',as_of:'2026-11-27',rows:[{metric_id:id,value:v[id],computable:true,unit:'INR'}]};acc.toolResults.push(out);return out;
  }
  if(name==='get_sponsor_metrics')return {rows:[{sponsor_name:'Acme',value:60,position:1}]};
  if(name==='list_records')return {edition_id:'ED-2026-DEMO',as_of:'2026-11-27',rows:[{sponsor_name:'Acme',opportunity_name:'Acme 2026',outstanding:60,overdue_amount:20,payment_schedule:[{due_date:'2026-11-20',remaining_amount:20}]}]};
  return {};
 },acc,{includeReceivableDetails:true});
 assert.ok(requested.includes('list_records:receivables'));
 assert.match(answer,/Cash actually collected/);assert.match(answer,/Due-date and urgency evidence/);assert.match(answer,/overdue/);assert.match(answer,/Reconciliation:/);
});
test('[MOCKED] as-of date controls overdue classification even when database overdue cache lags',async()=>{
 const acc=createToolAccumulator();
 const answer=await answerFinancial('cash_position',async(name,args)=>{
  if(name==='get_metric'){
   const id=String(args.metric_id),values:Record<string,number>={'M-02':110,'M-03':100,'M-04':10,'M-01':40,'M-07':60};
   return {rows:[{metric_id:id,value:values[id],computable:true}]};
  }
  if(name==='get_sponsor_metrics')return {rows:[{sponsor_name:'Mosaic Mobility',value:50_000,position:1}]};
  if(name==='list_records')return {edition_id:'ED-2026-DEMO',as_of:'2026-11-28',rows:[{sponsor_name:'Mosaic Mobility',opportunity_name:'Mosaic 2026',outstanding:50_000,overdue_amount:0,payment_schedule:[{due_date:'2026-11-27',remaining_amount:50_000}]}]};
  return {};
 },acc,{includeReceivableDetails:true});
 assert.match(answer,/Mosaic Mobility \/ Mosaic 2026 \| ₹50,000 \| ₹50,000/);
 assert.match(answer,/First follow-up:\*\* Mosaic Mobility has the largest documented past-due schedule balance \(₹50,000 as of 2026-11-28\)/);
 assert.doesNotMatch(answer,/Mosaic Mobility \/ Mosaic 2026[^\n]*₹0 recorded/);
});

test('[MOCKED] historical funnel derived movement passes grounding without pooling editions',async()=>{
 const q='Compare the 2025 historical funnel with the current 2026 simulated funnel. Where has conversion improved or deteriorated across the acquisition stages and channels? Show the numerator, denominator and conversion rate for each comparable stage. Explain which differences are meaningful and which may result from different sample sizes or data availability.';
 assert.equal(basicAnalyticsIntent(q),'historical_funnel_compare');
 const acc=createToolAccumulator();
 const answer=await answerBasicAnalytics('historical_funnel_compare',async(name,args)=>{
  if(name==='search_knowledge')return {available:false,chunks:[]};
  const id=String(args.metric_id),edition=String(args.edition_id),channel=String((args.filters as Record<string,string>).channel_group);
  const base={ 'M-11':{warm:.8,inbound:.6,cold:.2},'M-12':{warm:.5,inbound:.4,cold:.1},'M-13':{warm:.4,inbound:.3,cold:.1} };
  const value=base[id as keyof typeof base][channel as 'warm'|'inbound'|'cold']+(edition==='ED-2026-DEMO'?.05:0);
  const row={metric_id:id,value,numerator:2,denominator:5,computable:true,reason:null,unit:'ratio'};
  const out={source:'metrics.get_metric',edition_id:edition,record_class:edition==='ED-2025'?'historical_synthetic':'simulated',as_of:edition==='ED-2025'?'2025-04-20':'2026-11-27',rows:[row]};
  acc.toolResults.push(out);return out;
 },acc);
 assert.match(answer,/Directional comparison/);assert.match(answer,/percentage points/);assert.match(answer,/no rows are pooled/i);
 const verification=verifyScopedAnswer(answer,{toolResults:acc.toolResults,knowledgeTexts:[],userQuestion:q},{editionId:'ED-2026-DEMO',recordClass:'simulated',asOf:'2026-11-27'});assert.equal(verification.passed,true,JSON.stringify(verification));
});

test('[MOCKED] channel three-turn and combined prompts route to the appropriate evidence-backed answer',async()=>{
 const first='Which channel is currently giving us the strongest sponsorship acquisition results? Compare its performance with the other channels using the available data.';
 const why='Why do you think that channel is performing better? Separate what the data proves from what you are inferring.';
 const actions='Based on that diagnosis, give me the three most important actions for the team this week. Include the reason, the metric each action should move and how we will measure whether it worked.';
 assert.equal(basicAnalyticsIntent(why,false,first),'channel_why');
 assert.equal(basicAnalyticsIntent(actions,false,why),'channel_actions');
 assert.equal(basicAnalyticsIntent(`${first}\n${why}\n${actions}`),'channel_full_diagnosis');
 const acc=createToolAccumulator();
 const answer=await answerBasicAnalytics('channel_full_diagnosis',async(_name,args)=>{
  const c=String((args.filters as Record<string,string>).channel_group),v=c==='warm'?.6:c==='inbound'?.5:0;
  const out={source:'metrics.get_metric',edition_id:'ED-2026-DEMO',record_class:'simulated',as_of:'2026-11-27',rows:[{metric_id:'M-13',value:v,numerator:c==='warm'?3:c==='inbound'?1:0,denominator:c==='warm'?5:c==='inbound'?2:0,computable:c!=='cold',reason:c==='cold'?'No proposals sent yet.':null,unit:'ratio'}]};acc.toolResults.push(out);return out;
 },acc);
 assert.match(answer,/What the data proves/);assert.match(answer,/What is inference/);assert.match(answer,/Three actions for this week/);assert.match(answer,/No tasks or campaigns were created/);
});

test('[MOCKED] qualified-lead leakage query uses stage-specific campaign metrics without an LLM provider',async()=>{
 const q='Which campaigns and acquisition channels are losing the most qualified sponsorship opportunities before they become confirmed wins? Compare the stages using the correct counts and denominators, show the conversion rate for each comparable group, and identify where the largest number of qualified opportunities is being lost. Separate what the records prove from possible explanations. Recommend three actions for this week, naming the metric each should improve and how we’ll measure it. Don’t claim an action has been taken.';
 assert.equal(basicAnalyticsIntent(q),'campaign_leakage');
 const acc=createToolAccumulator();
 const answer=await answerBasicAnalytics('campaign_leakage',async(name,args)=>{
  if(name==='list_records'){
   const out={source:'list_campaigns',kind:'campaigns',edition_id:'ED-2026-DEMO',record_class:'simulated',as_of:'2026-11-27',rows:[{campaign_id:'C-A',name:'Warm Referrals'},{campaign_id:'C-B',name:'Inbound'}]};acc.toolResults.push(out);return out;
  }
  const metric=String(args.metric_id),campaign=String((args.filters as Record<string,string>).campaign_id);
  const base:Record<string,{value:number|null;numerator:number;denominator:number;computable:boolean}>={
   'M-10':campaign==='C-A'?{value:6,numerator:6,denominator:6,computable:true}:{value:10,numerator:10,denominator:10,computable:true},
   'M-17':campaign==='C-A'?{value:.5,numerator:3,denominator:6,computable:true}:{value:.2,numerator:2,denominator:10,computable:true},
   'M-18':campaign==='C-A'?{value:.33,numerator:2,denominator:6,computable:true}:{value:.8,numerator:8,denominator:10,computable:true},
   'M-19':campaign==='C-A'?{value:.17,numerator:1,denominator:6,computable:true}:{value:.6,numerator:6,denominator:10,computable:true},
  };
  const out={source:'metrics.get_metric',edition_id:'ED-2026-DEMO',record_class:'simulated',as_of:'2026-11-27',rows:[{metric_id:metric,...base[metric],unit:metric==='M-10'?'count':'ratio'}]};acc.toolResults.push(out);return out;
 },acc);
 assert.match(answer,/Warm Referrals/);assert.match(answer,/3 \/ 6/);assert.match(answer,/largest observed absolute leakage/i);assert.match(answer,/Stage comparison by acquisition channel/);assert.match(answer,/Recommended actions for this week/);
 const verification=verifyScopedAnswer(answer,{toolResults:acc.toolResults,knowledgeTexts:[],userQuestion:q},{editionId:'ED-2026-DEMO',recordClass:'simulated',asOf:'2026-11-27'});
 assert.equal(verification.passed,true,JSON.stringify(verification));
});

test('[MOCKED] follow-up priority request reads due-date evidence and states when urgency is unavailable',async()=>{
 const q='For the outstanding balances you just listed, show the due date and overdue status where the records provide them. If there’s no due-date evidence, say so. Then prioritize follow-up by documented urgency and amount, and identify any balances that cannot be prioritized from the available data.';
 assert.equal(operationalIntent(q)?.kind,'receivable_followup');
 const acc=createToolAccumulator();
 const answer=await answerOperational({kind:'receivable_followup'},async(name,args)=>{
  if(name==='list_records'){
   const out={source:'list_receivables',kind:'receivables',edition_id:'ED-2026-DEMO',record_class:'simulated',as_of:'2026-11-27',rows:[
    {sponsor_name:'Late Sponsor',opportunity_name:'Late deal',outstanding:80000,overdue_amount:30000,payment_schedule:[{due_date:'2026-11-20',remaining_amount:30000}]},
    {sponsor_name:'Undated Sponsor',opportunity_name:'Undated deal',outstanding:60000,overdue_amount:0,payment_schedule:[]},
   ]};acc.toolResults.push(out);return out;
  }
  const out={source:'metrics.get_metric',edition_id:'ED-2026-DEMO',record_class:'simulated',as_of:'2026-11-27',rows:[{metric_id:'M-07',value:140000,computable:true}]};acc.toolResults.push(out);return out;
 },acc);
 assert.match(answer,/2026-11-20: ₹30,000 remaining \(overdue as of 2026-11-27\)/);assert.match(answer,/No unpaid schedule due date returned/);assert.match(answer,/Late Sponsor/);assert.match(answer,/urgency cannot be established/);
 const verification=verifyScopedAnswer(answer,{toolResults:acc.toolResults,knowledgeTexts:[],userQuestion:q},{editionId:'ED-2026-DEMO',recordClass:'simulated',asOf:'2026-11-27'});assert.equal(verification.passed,true,JSON.stringify(verification));
});
