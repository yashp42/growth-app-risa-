import assert from 'node:assert/strict';
import test from 'node:test';
import { financialIntent, answerFinancial, getInventory } from '../server/llm/financialAnswers.ts';
import { terms, expandedTerms, lexicalRank } from '../server/llm/lexicalSearch.ts';
import { verifyAnswerNumbers } from '../server/llm/answerCheck.ts';
import { basicAnalyticsIntent } from '../server/llm/basicAnalytics.ts';
import { prospectIntent, answerProspects } from '../server/llm/prospectAnswers.ts';
import type { ToolRunAccumulator } from '../server/llm/tools.ts';
const acc=():ToolRunAccumulator=>({toolResults:[],knowledgeTexts:[],metricResults:[],citations:[]});
test('[MOCKED] pricing and forecast plans recognise paraphrases and preserve explicit filters and write boundaries',()=>{
 for(const q of ['How many activation slots are there and what do they cost?','Show activation pricing','What do activations cost?'])assert.equal(financialIntent(q),'activation_inventory');
 for(const q of ['Is the ₹28.6L expected amount already collected?','Have we received the stretch forecast?','Compare actual collected cash with our forecast'])assert.equal(financialIntent(q),'forecast_actual');
 assert.equal(financialIntent('Change the stretch forecast to collected'),null);assert.equal(financialIntent('Activation pricing',true),null);
 assert.equal(basicAnalyticsIntent("What's the total signed sponsorship value for 2025?"),'signed');
 assert.equal(basicAnalyticsIntent('Show our signed total'),'signed');assert.equal(basicAnalyticsIntent('Compare proposal-to-win conversion across campaigns'),'campaign_conversion');
 assert.equal(basicAnalyticsIntent('How much sponsorship value did we sign in 2024?'),null);
 assert.equal(prospectIntent('Who should we prioritise for outreach?')?.kind,'prioritise');assert.equal(prospectIntent('Which fintech prospects have verified routes?')?.kind,'routes');assert.equal(prospectIntent('What is Alpha worth and is it in the pipeline?')?.kind,'status');
});
test('[MOCKED] forecast answers use changed stored scenario values and current receipts without imposing a no-payments fixture',async()=>{
 const state=acc();const calls:string[]=[];
 const answer=await answerFinancial('forecast_actual',async(name)=>{
  calls.push(name);const result=name==='get_scenario'?{scenarios:[{scenario_id:'SC-03',name:'Stretch',expected_cash:31.19,p10:22.7,p50:30.1,p90:40.2}],cash_unit:'INR_lakh'}:name==='get_metric'?{rows:[{metric_id:'M-01',computable:true,value:456789,unit:'INR'}]}:{};
  state.toolResults.push(result);return result;
 },state);
 assert.match(answer,/₹31.19L/);assert.match(answer,/₹4,56,789/);assert.match(answer,/forecasts/);assert.match(answer,/not actual collected/);assert.doesNotMatch(answer,/no payment records|no cash has been recorded/i);
 assert.deepEqual(calls,['get_scenario','get_metric','search_knowledge']);assert.equal(verifyAnswerNumbers(answer,{toolResults:state.toolResults,knowledgeTexts:[],userQuestion:''}).passed,true);
});
test('[MOCKED] non-computable collected cash remains unknown rather than becoming zero',async()=>{
 const state=acc();const answer=await answerFinancial('forecast_actual',async(name)=>name==='get_scenario'?{scenarios:[]}:name==='get_metric'?{rows:[{computable:false,value:null,reason:'No receipt ledger'}]}:{},state);
 assert.match(answer,/not computable/);assert.match(answer,/No receipt ledger/);assert.doesNotMatch(answer,/₹0/);
});
test('[MOCKED] inventory reads visible complete sources and filters assets using source identifiers, not fixture values',async()=>{
 const pool={query:async(sql:string,params?:unknown[])=>({rows:sql.includes('FROM ref.dataset WHERE')?[{dataset_id:params?.[0],columns:['asset','slots','price_lakh'],record_class:'model_output',status:'approved'}]:[{row_no:1,data:{asset:'activation',slots:17,price_lakh:0.19}},{row_no:2,data:{asset:'title',slots:1,price_lakh:8}}]}) as any};
 const result=await getInventory(pool,'activation',{asOf:'2026-11-26',dataVersion:71});assert.equal(result.available,true);
 for(const dataset of result.datasets as Record<string,any>[]){assert.equal(dataset.rows.length,1);assert.equal(dataset.rows[0].slots,17);assert.equal(dataset.rows[0].price_lakh,0.19);}
 const state=acc();const answer=await answerFinancial('activation_inventory',async(name)=>{const value=name==='get_register'?result:{};state.toolResults.push(value);return value;},state);
 assert.match(answer,/17/);assert.match(answer,/0.19/);assert.match(answer,/asking-price ratios/);assert.equal(verifyAnswerNumbers(answer,{toolResults:state.toolResults,knowledgeTexts:[],userQuestion:''}).passed,true);
});
test('[MOCKED] prospect introduction caveats are asserted only when returned research notes support them',async()=>{
 const build=async(text:string)=>{const state=acc();state.citations=[{type:'knowledge',id:'KB-MOCK',text}];return answerProspects({kind:'prioritise'},async(name)=>name==='get_register'?{available:true,columns:['company'],rows:[{company:'Alpha'}]}:{},state);};
 assert.match(await build('None has a confirmed introduction.'),/no confirmed introductions were recorded/);
 assert.doesNotMatch(await build('Introduction status needs checking.'),/no confirmed introductions were recorded/);
});
test('[MOCKED] enriched retrieval drops question stopwords and ranks specific chunk evidence over generic title hits',()=>{
 assert.deepEqual(terms('What is the capacity of our team?'),['capacity','team']);assert.ok(expandedTerms('team capacity').includes('staffing'));
 const rows=[{chunk_id:'GENERIC',document_title:'What we can do with our plan',section:'Overview',text:'General forecast and marketing notes',base_rank:99},{chunk_id:'SPECIFIC',document_title:'Execution constraints',section:'Capacity',text:'Team staffing and capacity in person-weeks constrain the stretch plan.',base_rank:0.1}];
 assert.equal(lexicalRank('Can the team actually execute the stretch plan?',rows)[0].chunk_id,'SPECIFIC');
});
