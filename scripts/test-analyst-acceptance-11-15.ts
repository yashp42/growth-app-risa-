import assert from 'node:assert/strict';
import test from 'node:test';
import { financialIntent, answerFinancial } from '../server/llm/financialAnswers.ts';
import { strategyIntent, answerStrategy } from '../server/llm/strategyAnswers.ts';
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
});
