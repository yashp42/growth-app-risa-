import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAnswerBlocks, extractBlockChoice } from '../server/llm/answerBlocks.ts';
import { verifyAnswerNumbers } from '../server/llm/answerCheck.ts';
import { getDataset, listDatasets, referenceStatus } from '../server/llm/referenceData.ts';
import { scoreCase } from './lib/retrievalMetrics.ts';
import type { QueryablePool } from '../server/llm/tools.ts';
const ctx = { asOf: '2026-11-26', dataVersion: 67 };

test('[MOCKED] malformed, embedded, repeated and truncated block tags never reach visible text', () => {
  for (const tag of ['[[blocks: table|none]]', '[[blocks: bad]]', '[[blocks: table]', '[[blocks: table']) {
    assert.equal(extractBlockChoice('Answer.\n' + tag).answer, 'Answer.');
  }
  assert.deepEqual(extractBlockChoice('Before [[blocks: table|none]] after\n[[blocks: chart]]'), { answer: 'Before  after', choice: 'chart' });
  assert.deepEqual(extractBlockChoice('Answer.\n[[blocks: none]]'), { answer: 'Answer.', choice: 'none' });
});

test('[MOCKED] dataset numbers participate in grounding; fabricated values fail', () => {
  const bundle = { toolResults: [{ source: 'ref.dataset_row', rows: [{ price: 80000 }] }], knowledgeTexts: [], userQuestion: 'Show the price' };
  assert.equal(verifyAnswerNumbers('₹80,000', bundle).passed, true);
  assert.equal(verifyAnswerNumbers('₹99L', bundle).passed, false);
});

test('[MOCKED] hidden or unknown datasets return no metadata and never query rows', async () => {
  let calls = 0;
  const pool = { query: async (sql: string) => { calls++; assert.match(sql, /ai_visible = true/); return { rows: [] }; } } as unknown as QueryablePool;
  const r = await getDataset(pool, { dataset_id: 'ai_evaluation.chatbot_test_bank' }, ctx);
  assert.equal(r.available, false); assert.equal(calls, 1); assert.ok(!('source_sha256' in r));
});

const metadata = { dataset_id: 'market_research.prospect_register', title: 'Researched prospects', status: 'external research', record_class: 'external_research', source_path: 'prospects.csv', source_sha256: 'abc', columns: ['company', 'action', 'face_value'], row_count: 37 };
test('[MOCKED] dataset filters are parameters, rows are projected, provenance preserved, truncation disclosed', async () => {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = { query: async (sql: string, params?: unknown[]) => { calls.push({sql, params}); return sql.includes('SELECT dataset_id') ? { rows: [metadata] } : { rows: [{row_no:1, data:{company:'Zerodha', action:'1 Pursue now', face_value:80000}}, {row_no:2,data:{company:'Other'}}] }; } } as unknown as QueryablePool;
  const r = await getDataset(pool, {dataset_id: metadata.dataset_id, filter: { action: '1 Pursue now' }, columns: ['company','face_value'], limit: 1}, ctx);
  assert.deepEqual(r.rows, [{company:'Zerodha',face_value:80000}]); assert.equal(r.truncated,true);
  assert.equal(r.source_sha256,'abc'); assert.match(String(r.status_label),/not pipeline/);
  assert.match(calls[1].sql,/ai_visible = true/); assert.match(calls[1].sql,/r.data @> \$2::jsonb/);
  assert.deepEqual(calls[1].params,[metadata.dataset_id, '{"action":"1 Pursue now"}',2]);
  const blocks=buildAnswerBlocks({toolResults:[r],metricResults:[],choice:'table'});
  assert.equal(blocks[0].type,'table'); assert.equal(blocks[0].source,'ref.dataset_row');
  if(blocks[0].type==='table'){assert.equal(blocks[0].source_sha256,'abc'); assert.equal(blocks[0].rows[0].face_value,80000);}
});

test('[MOCKED] invalid columns and limits are rejected before reading rows', async () => {
  const pool={query:async()=>({rows:[metadata]})} as unknown as QueryablePool;
  await assert.rejects(()=>getDataset(pool,{dataset_id:'x',columns:['company); DROP TABLE ref.dataset;--']},ctx),/Unknown dataset column/);
  await assert.rejects(()=>getDataset(pool,{dataset_id:'x',filter:{nonexistent:'a'}},ctx),/Unknown dataset column/);
  await assert.rejects(()=>getDataset(pool,{dataset_id:'x',limit:51},ctx),/limit/);
});

test('[MOCKED] catalogue query cannot bypass visibility or inject wildcard searches', async () => {
  const pool={query:async(sql:string,params:unknown[])=>{assert.match(sql,/ai_visible = true/);assert.deepEqual(params,['%_','%\\%\\_%']);return {rows:[]};}} as unknown as QueryablePool;
  await listDatasets(pool,'%_',ctx);
  assert.match(referenceStatus('model_output','option'),/not approved/);
});

test('[MOCKED] precision@6 penalises missing slots; recall measures expected chunks', () => {
  assert.equal(scoreCase(['KB-01.1'],['KB-01.1']).precision,1/6);
  assert.equal(scoreCase(['KB-01.1'],['KB-01.1']).recall,1);
  assert.equal(scoreCase(['KB-01.1'],[]).precision,0);
});
import { normaliseAnswerPresentation } from '../server/llm/answerBlocks.ts';
test('[MOCKED] answer formatting groups exact rupees, preserves lakh precision, IDs and dates',()=>{
  assert.equal(normaliseAnswerPresentation('₹1240000 [M-21] on 2026-11-26'), '₹12,40,000 [M-21] on 2026-11-26');
  assert.equal(normaliseAnswerPresentation('₹12.40L and ₹60000.50 【M-21】'), '₹12.40L and ₹60,000.50 [M-21]');
  assert.equal(normaliseAnswerPresentation('ID 1240000, 2026-11-26'), 'ID 1240000, 2026-11-26');
});
test('[MOCKED] curated benchmark exports retain external-research status',()=>{
  assert.match(referenceStatus('model_output','curated export','data_foundation.curated_data.external_benchmarks'),/External research/);
  assert.match(referenceStatus('model_output','analysis, not approved'),/not approved/);
});
import { hasRawToolCall, formatScenarioCash, answerOnlyMessages, ANSWER_ONLY_INSTRUCTION } from '../server/llm/responsePolicy.ts';
test('[MOCKED] synthesis has an explicit answer-only instruction without mutating history or retry text',()=>{
  const messages=[{role:'system' as const,content:'Original guardrails'},{role:'user' as const,content:'Verification failed: rewrite only'}];
  const result=answerOnlyMessages(messages);assert.ok(result[0].content?.includes(ANSWER_ONLY_INSTRUCTION));
  assert.equal(result.at(-1)?.content,'Verification failed: rewrite only');assert.equal(messages[0].content,'Original guardrails');
});
test('[MOCKED] raw model tool-call markup is rejected, not executed or displayed',()=>{
  assert.equal(hasRawToolCall('<tool_call><function=search_knowledge><parameter=query>x</parameter></tool_call>'),true);
  assert.equal(hasRawToolCall('Collected cash is ₹2,72,500 [M-01].'),false);
});
test('[MOCKED] scenario fallback money explicitly preserves the stored lakh unit',()=>{
  assert.equal(formatScenarioCash(21.23),'₹21.23L');assert.equal(formatScenarioCash(28.64),'₹28.64L');assert.equal(formatScenarioCash(null),'—');
});
import { isGreeting, requestBudget } from '../server/llm/requestBudget.ts';
test('[MOCKED] reviewer and evaluation allowances are separate; unknown internal tokens grant no evaluation budget',()=>{
  const secret='s'.repeat(64);const reviewer=requestBudget('demo','client','demo',secret);
  const evaluation=requestBudget('demo','loopback','demo',secret,secret);
  assert.equal(reviewer.limit,60);assert.equal(evaluation.limit,300);assert.notEqual(reviewer.key,evaluation.key);
  assert.equal(requestBudget('demo','client','demo',secret,'forged').evaluation,false);
  assert.equal(requestBudget('normal','client','production').limit,15);
});
test('[MOCKED] greetings need no model request; operational commands are not mistaken for greetings',()=>{
  assert.equal(isGreeting('hello!'),true);assert.equal(isGreeting('Hi'),true);assert.equal(isGreeting('hello, move Voltyatra'),false);
});
import { providerOrder, readDailyFreeQuota } from '../server/llm/freeModelPolicy.ts';
test('[MOCKED] OpenRouter USD credit balances are never treated as free request counts',()=>{
  assert.deepEqual(readDailyFreeQuota({limit:0,limit_remaining:0,usage_daily:0,free_model_daily_requests:{limit:50,used:7,remaining:43}}),{limit:50,used:7,remaining:43,exhausted:false});
  assert.equal(readDailyFreeQuota({limit_remaining:0}).exhausted,false);
  assert.equal(readDailyFreeQuota({free_model_daily_requests:{limit:50,used:50,remaining:0}}).exhausted,true);
});
test('[MOCKED] OpenRouter-first preserves model order within each provider and retains Groq fallback',()=>{
  const entries=[{provider:'groq' as const,model:'g1'},{provider:'openrouter' as const,model:'o1'},{provider:'groq' as const,model:'g2'},{provider:'openrouter' as const,model:'o2'}];
  assert.deepEqual(providerOrder(entries,'openrouter_first').map(x=>x.model),['o1','o2','g1','g2']);assert.equal(entries[0].model,'g1');
});
