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
