import assert from 'node:assert/strict';
import test from 'node:test';
import { filterProspects, getProspects } from '../server/llm/prospects.ts';
import { prospectIntent, answerProspects } from '../server/llm/prospectAnswers.ts';
import { verifyAnswerNumbers } from '../server/llm/answerCheck.ts';
import type { ToolRunAccumulator } from '../server/llm/tools.ts';
const rows=[
 {company:'Alpha',category:'Consumer fintech',action:'1 Pursue now',route_class:'V1',priority_index:61.2,track:'cash',face_value_lakh:1.8,introductions:0},
 {company:'Beta',category:'Consumer fintech',action:'1 Pursue now',route_class:'V3 — local presence',priority_index:88.4,track:'in-kind',face_value_lakh:3.4,introductions:0},
 {company:'Gamma',category:'Consumer fintech',action:'2 Later',route_class:'U1',priority_index:95,track:'cash',face_value_lakh:4,introductions:0},
 {company:'Delta',category:'Food',action:'1 Pursue now',route_class:'V2',priority_index:71,track:'cash',face_value_lakh:2,introductions:0},
];
const data={available:true,columns:Object.keys(rows[0]),rows,source:'ref.dataset_row',dataset_id:'market_research.prospect_register'};
const acc=():ToolRunAccumulator=>({toolResults:[],metricResults:[],citations:[],knowledgeTexts:[]});
test('[MOCKED] prospects filter the complete register by action and stored priority without dropping the final qualifying row',()=>{
 const result=filterProspects(data,{action:'Pursue now'});assert.deepEqual((result.rows as typeof rows).map(r=>r.company),['Beta','Delta','Alpha']);assert.equal(rows[0].company,'Alpha');
});
test('[MOCKED] fintech route filter requires both category and V1–V3; a route never creates an introduction',()=>{
 const result=filterProspects(data,{category:'fintech',verified_route:true});assert.deepEqual((result.rows as typeof rows).map(r=>r.company),['Beta','Alpha']);assert.ok((result.rows as typeof rows).every(r=>r.introductions===0));
 assert.equal((filterProspects(data,{company:' alpha '}).rows as typeof rows)[0].company,'Alpha');
});
test('[MOCKED] unknown filter columns and truncated sources fail closed rather than inventing eligibility',async()=>{
 assert.throws(()=>filterProspects({...data,columns:['company']},{verified_route:true}),/no recognised route/);
 let calls=0;await assert.rejects(()=>getProspects({query:async()=>{calls++;return {rows:calls===1?[{dataset_id:'market_research.prospect_register',columns:data.columns,record_class:'external_research',status:'research'}]:Array(51).fill({row_no:1,data:rows[0]})} as any;}},{},{asOf:'2026-11-26',dataVersion:67}),/complete-read limit/);
});
test('[MOCKED] prospect routing supports arbitrary company/category requests without swallowing writes or filtered questions',()=>{
 assert.deepEqual(prospectIntent('Is Alpha in our pipeline, and what is it worth?'),{kind:'status',company:'Alpha'});
 assert.deepEqual(prospectIntent('Which fintech prospects have a verified route to them?'),{kind:'routes',category:'fintech'});
 assert.equal(prospectIntent('Which prospects should we pursue first?')?.kind,'prioritise');
 assert.equal(prospectIntent('Which prospects should we pursue first?',true),null);assert.equal(prospectIntent('Is Alpha in our pipeline, and create a deal'),null);
});
test('[MOCKED] research status reads both research and operational sources, preserves face values and cites only retrieved notes',async()=>{
 const state=acc();const calls:string[]=[];
 const answer=await answerProspects({kind:'status',company:'Alpha'},async(name,args)=>{
  calls.push(name+':'+String(args.kind??''));
  if(name==='search_knowledge'){state.citations.push({type:'knowledge',id:'KB-MOCK',text:'Research face value is not a forecast. No introductions are recorded.'});state.knowledgeTexts.push('Research face value is not a forecast. No introductions are recorded.');return {};}
  const result=name==='get_register'?filterProspects(data,args.filters as any):{rows:[]};state.toolResults.push(result);return result;
 },state);
 assert.deepEqual(calls,['get_register:prospects','list_records:opportunities','list_records:sponsors','search_knowledge:']);
 assert.match(answer,/No matching opportunities or sponsors/);assert.match(answer,/1.8/);assert.match(answer,/not an introduction/);assert.match(answer,/KB-MOCK/);assert.doesNotMatch(answer,/KB-03.5/);
 assert.equal(verifyAnswerNumbers(answer,{toolResults:state.toolResults,knowledgeTexts:state.knowledgeTexts,userQuestion:''}).passed,true);
});
test('[MOCKED] active operational records are not falsely described as absent or assigned a forecast',async()=>{
 const answer=await answerProspects({kind:'status',company:'Alpha'},async(name)=>name==='get_register'?filterProspects(data,{company:'Alpha'}):name==='list_records'?{rows:[{name:'Active opportunity'}]}:{},acc());
 assert.match(answer,/Matching operational records were returned/);assert.doesNotMatch(answer,/No matching opportunities/);
});
