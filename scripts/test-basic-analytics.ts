import assert from 'node:assert/strict';
import test from 'node:test';
import { answerBasicAnalytics, basicAnalyticsIntent } from '../server/llm/basicAnalytics.ts';
import { verifyAnswerNumbers } from '../server/llm/answerCheck.ts';
import type { ToolRunAccumulator } from '../server/llm/tools.ts';
const accumulator = (): ToolRunAccumulator => ({toolResults:[],metricResults:[],citations:[],knowledgeTexts:[]});
test('[MOCKED] basic routing recognises analytics but rejects filters, compound requests and writes',()=>{
 assert.equal(basicAnalyticsIntent('How much sponsorship value did we sign in 2025?'),'signed');
 assert.equal(basicAnalyticsIntent('What is the proposal-to-win conversion for each campaign?'),'campaign_conversion');
 for(const q of ['Move signed total to 2025','Signed total for Beardo','Signed total and create a task','What is conversion for warm campaigns?']) assert.equal(basicAnalyticsIntent(q),null);
 assert.equal(basicAnalyticsIntent('Signed total',true),null);
 assert.equal(basicAnalyticsIntent('Compare the 2025 historical funnel with the current 2026 simulated funnel across acquisition stages and channels.'),'historical_funnel_compare');
});
test('[MOCKED] signed summary uses changing source metrics and real retrieved citations, with no model',async()=>{
 const acc=accumulator();const calls:string[]=[];
 const answer=await answerBasicAnalytics('signed',async(name,args)=>{
  calls.push(name+':'+String(args.metric_id??''));
  if(name==='search_knowledge') {acc.citations.push({type:'knowledge',id:'KB-MOCK',text:'Synthetic signed commitments are not collections.'});acc.knowledgeTexts.push('Synthetic signed commitments are not collections.');return {};}
  const row={metric_id:args.metric_id,computable:true,value:args.metric_id==='M-09'?37:987654,unit:args.metric_id==='M-09'?'count':'INR'};
  const out={rows:[row]};acc.toolResults.push(out);return out;
 },acc);
 assert.match(answer,/9,87,654/);assert.match(answer,/37/);assert.match(answer,/Cash-type/);assert.match(answer,/In-kind/);assert.match(answer,/KB-MOCK/);
 assert.deepEqual(calls.slice(0,4),['get_metric:M-02','get_metric:M-03','get_metric:M-04','get_metric:M-09']);
 assert.equal(verifyAnswerNumbers(answer,{toolResults:acc.toolResults,knowledgeTexts:acc.knowledgeTexts,userQuestion:''}).passed,true);
});
test('[MOCKED] campaign summary preserves source numerator, denominator and ratio without model arithmetic',async()=>{
 const acc=accumulator();const seen:unknown[]=[];
 const answer=await answerBasicAnalytics('campaign_conversion',async(name,args)=>{
  if(name==='list_records')return {rows:[{campaign_id:'C-MOCK',name:'Example | channel'}]};
  if(name==='search_knowledge')return {};
  seen.push(args.filters);const out={rows:[{value:0.375,numerator:3,denominator:8,unit:'ratio',computable:true}]};acc.toolResults.push(out);return out;
 },acc);
 assert.deepEqual(seen,[{campaign_id:'C-MOCK'}]);assert.match(answer,/3 \| 8 \| 0.375 ratio/);assert.ok(answer.includes('Example ' + String.fromCharCode(92) + '| channel'));
 assert.equal(verifyAnswerNumbers(answer,{toolResults:acc.toolResults,knowledgeTexts:[],userQuestion:''}).passed,true);
 assert.doesNotMatch(answer,/KB-06.2/);
});
test('[MOCKED] missing and truncated sources are never fabricated as complete analytics',async()=>{
 await assert.rejects(()=>answerBasicAnalytics('signed',async()=>({rows:[]}),accumulator()),/no row/);
 await assert.rejects(()=>answerBasicAnalytics('campaign_conversion',async()=>({rows:Array(25).fill({campaign_id:'x'})}),accumulator()),/truncated/);
});
test('[MOCKED] historical funnel reads each edition separately and labels all stage denominators',async()=>{
 const acc=accumulator();const calls:Array<Record<string,unknown>>=[];
 const answer=await answerBasicAnalytics('historical_funnel_compare',async(name,args)=>{
  calls.push(args);if(name==='search_knowledge')return {};
  const out={rows:[{metric_id:args.metric_id,edition_id:args.edition_id,record_class:args.edition_id==='ED-2025'?'historical_synthetic':'simulated',computable:true,value:0.5,numerator:5,denominator:10}]};acc.toolResults.push(out);return out;
 },acc);
 assert.equal(calls.filter(x=>x.metric_id).length,18);
 assert.ok(calls.some(x=>x.edition_id==='ED-2025'));assert.ok(calls.some(x=>x.edition_id==='ED-2026-DEMO'));
 assert.match(answer,/5 \| 10 \| 50\.0%/);assert.match(answer,/different denominators/);assert.match(answer,/unchanged/);
 assert.equal(verifyAnswerNumbers(answer,{toolResults:acc.toolResults,knowledgeTexts:[],userQuestion:''}).passed,true);
});
test('[MOCKED] three-turn channel diagnosis retains context and ties recommendations to evidence',async()=>{
 const start='Which channel is currently giving us the strongest sponsorship acquisition results? Compare its performance with the other channels using the available data.';
 const why='Why do you think that channel is performing better? Separate what the data proves from what you are inferring.';
 const actions='Based on that diagnosis, give me the three most important actions for the team this week. Include the reason, metric each action should move and how we will measure whether it worked.';
 assert.equal(basicAnalyticsIntent(start),'channel_performance');
 assert.equal(basicAnalyticsIntent(why,false,start),'channel_why');
 assert.equal(basicAnalyticsIntent(actions,false,why),'channel_actions');
 const acc=accumulator();
 const read=async(_name:string,args:Record<string,unknown>)=>{
  const channel=String((args.filters as Record<string,unknown>).channel_group);
  const data:Record<string,{n:number;d:number}>={warm:{n:17,d:18},inbound:{n:7,d:7},cold:{n:0,d:21}};
  const row={metric_id:'M-13',value:data[channel].n/data[channel].d,numerator:data[channel].n,denominator:data[channel].d,computable:true};
  const out={rows:[row]};acc.toolResults.push(out);return out;
 };
 const answer=await answerBasicAnalytics('channel_performance',read,acc);
 assert.match(answer,/inbound/);assert.match(answer,/7 wins from 7 proposals/);assert.match(answer,/17 \| 18/);assert.match(answer,/0 \| 21/);
 const diagnosis=await answerBasicAnalytics('channel_why',read,acc);
 assert.match(diagnosis,/What the data proves/);assert.match(diagnosis,/What is inference/);
 const plan=await answerBasicAnalytics('channel_actions',read,acc);
 assert.match(plan,/- Review every open/);assert.match(plan,/- Run a small/);assert.match(plan,/- Audit cold-channel/);assert.match(plan,/M-21/);assert.match(plan,/no tasks or campaigns were executed/);
});
