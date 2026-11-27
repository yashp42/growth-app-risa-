import test from 'node:test';
import assert from 'node:assert/strict';
import { planQuestion, relevantToolNames } from '../server/llm/questionPlan.ts';
import { prospectIntent } from '../server/llm/prospectAnswers.ts';
import { verifyScopedAnswer, verifiedFactsFallback } from '../server/llm/claimGrounding.ts';
import { isGeneralAdvice, deterministicGeneralAdvice } from '../server/llm/advice.ts';
import { basicAnalyticsIntent } from '../server/llm/basicAnalytics.ts';
import { financialIntent } from '../server/llm/financialAnswers.ts';
import { hasInternalToolLeak } from '../server/llm/responsePolicy.ts';
const scope={editionId:'ED-2026-DEMO',recordClass:'simulated',asOf:'2026-11-27'};
const bundle=(results:unknown[],question='')=>({toolResults:results,knowledgeTexts:[],userQuestion:question});
const metric=(id:string,value:number)=>({source:'metrics.get_metric',edition_id:scope.editionId,record_class:scope.recordClass,as_of:scope.asOf,rows:[{metric_id:id,value,unit:'INR',computable:true}]});
for(const q of ['Is there any high potential sponsor that we should focus on currently?','Which brands look promising for outreach?','Recommend new sponsors we can approach','Who should we prioritize for outreach?','Which prospects deserve our attention first?'])test('[MOCKED] unfamiliar prospect wording: '+q,()=>{
 assert.equal(planQuestion(q).task,'prospects');assert.equal(prospectIntent(q)?.kind,'prioritise');
});
test('[MOCKED] prioritisation never mistakes operational collections for future prospect evidence',()=>{
 const plan=planQuestion('Which potential sponsor should we focus on?');
 assert.equal(relevantToolNames(plan)?.has('get_sponsor_metrics'),false);
 assert.equal(relevantToolNames(plan)?.has('get_register'),true);
 assert.equal(planQuestion('Which existing pipeline opportunities should we focus on?').task,'pipeline');
 assert.equal(prospectIntent('Create a task to approach the most promising sponsor'),null);
 assert.equal(planQuestion('Create a task for Alpha').task,'action');
});
test('[MOCKED] product-help wording is never treated as write authorisation or broad retrieval',()=>{
 const plan=planQuestion('How do I create a campaign?');
 assert.equal(plan.task,'product_help');
 assert.equal(relevantToolNames(plan).size,0);
 assert.equal(relevantToolNames(planQuestion('Give me general advice')).size,0);
 assert.equal(relevantToolNames(planQuestion('Create a task for Alpha')).has('propose_changes'),true);
});
test('[MOCKED] operating-review advice is useful without provider or database access',()=>{
 const q='I have a 15-minute weekly review with four campaign owners. How should I structure it so we spot risks and leave with clear owners and next steps?';
 assert.equal(isGeneralAdvice(q),true);assert.match(deterministicGeneralAdvice(q),/15-minute campaign review/);
});
test('[MOCKED] natural campaign and historical-cash wording has deterministic evidence routes',()=>{
 assert.equal(basicAnalyticsIntent('In the current simulated edition, which campaign has the weakest proposal-to-win conversion? Compare the proposals and confirmed wins.'),'campaign_conversion');
 assert.equal(financialIntent('For the 2025 edition, which sponsors paid late and what was the actual cash collection rate?'),'collection_status');
});
test('[MOCKED] budget shorthand uses the verified cash-position route, not an internal tool instruction',()=>{
 assert.equal(financialIntent('budget?'),'cash_position');
 assert.equal(financialIntent("What's our current sponsorship budget?"),'cash_position');
 assert.equal(financialIntent('What is the approved budget target?'),null);
 assert.equal(hasInternalToolLeak('Run get_sponsor_metrics to see the budget.'),true);
 assert.equal(hasInternalToolLeak('Current signed value is ₹9,90,000 [M-02].'),false);
});
test('[MOCKED] follow-up retrieves prior task wording without importing old numeric evidence',()=>{
 const p=planQuestion('What about their verified routes?','Which prospects should we pursue first?');assert.equal(p.task,'prospects');assert.match(p.retrievalQuery,/prospects.*routes/);
 assert.equal(planQuestion('How much cash have we collected?','Which prospects should we pursue first?').task,'finance');
 assert.equal(planQuestion('What changed from the old decision?').includeHistory,true);
});
test('[MOCKED] a number present under another sponsor cannot support the named sponsor',()=>{
 const p={kind:'sponsor_metrics',rows:[{sponsor_name:'Alpha Works',value:71000},{sponsor_name:'Beta Works',value:92000}]};
 assert.equal(verifyScopedAnswer('Alpha Works collected ₹92,000.',bundle([p]),scope).passed,false);
 assert.equal(verifyScopedAnswer('Alpha Works collected ₹71,000.',bundle([p]),scope).passed,true);
});
test('[MOCKED] overdue installment is not confused with a sponsor total receivable',()=>{
 const p={kind:'sponsor_metrics',metric_id:'M-07',rows:[{sponsor_name:'Kaveri Threads',value:60000}]};
 const schedule={kind:'receivables',rows:[{sponsor_name:'Kaveri Threads',overdue_amount:30000}]};
 const answer='Kaveri Threads has ₹30,000 overdue on a scheduled installment.';
 assert.equal(verifyScopedAnswer(answer,bundle([p,schedule]),scope).passed,true);
 assert.equal(verifyScopedAnswer('Kaveri Threads outstanding cash is ₹30,000 [sponsor_metrics:M-07].',bundle([p,schedule]),scope).passed,false);
});
test('[MOCKED] metric, edition and date mismatch fail even when the number exists somewhere',()=>{
 const m=metric('M-01',71000),signed=metric('M-02',92000);
 assert.equal(verifyScopedAnswer('Cash collected: ₹92,000 [M-01]',bundle([m,signed]),scope).passed,false);
 assert.equal(verifyScopedAnswer('Cash collected: ₹71,000 [M-01]',bundle([m]),scope).passed,true);
 assert.equal(verifyScopedAnswer('Cash collected: ₹71,000 [M-01]',bundle([{...m,edition_id:'ED-2025'}]),scope).passed,false);
 assert.equal(verifyScopedAnswer('Cash collected: ₹71,000 [M-01]',bundle([{...m,as_of:'2026-11-01'}]),scope).passed,false);
});
test('[MOCKED] changed data changes the verified fallback without model arithmetic or fixed expected output',()=>{
 const before=verifiedFactsFallback(bundle([metric('M-01',71000)]));const after=verifiedFactsFallback(bundle([metric('M-01',194000)]));
 assert.match(before,/₹71,000/);assert.match(after,/₹1,94,000/);assert.doesNotMatch(after,/71,000/);
 assert.match(verifiedFactsFallback(bundle([])),/enough verified evidence/);
});
test('[MOCKED] user-suggested amounts are not supporting evidence; references retain their own provenance',()=>{
 assert.equal(verifyScopedAnswer('We collected ₹9,99,999.',bundle([],'Did we collect ₹9,99,999?'),scope).passed,false);
 assert.equal(verifyScopedAnswer('Research cash potential: ₹71,000.',bundle([{record_class:'external_research',edition_id:'REFERENCE',rows:[{cash_potential:71000}]}]),scope).passed,true);
});
