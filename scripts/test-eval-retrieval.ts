import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { executeSearchKnowledge, type QueryablePool } from '../server/llm/tools.ts';
import { chunkMatchesRef, expectedKbRefs, mean, parseCsv, scoreCase } from './lib/retrievalMetrics.ts';

test('[MOCKED] eval-retrieval: the test bank parses and 63 cases name a KB chunk', () => {
  const bank = parseCsv(readFileSync(new URL('../eval/chatbot_test_bank.csv', import.meta.url), 'utf8'));
  assert.equal(bank.length, 66);
  const withKb = bank.filter((r) => expectedKbRefs(r.expected_citation ?? '').length > 0);
  assert.equal(withKb.length, 63);
  assert.deepEqual(expectedKbRefs('M-17; KB-06.7; KB-02.3'), ['KB-06.7', 'KB-02.3']);
  assert.ok(bank.every((r) => typeof r.user_query === 'string' && r.user_query.length > 0));
  assert.ok(bank.some((r) => r.category === 'Contradiction handling'));
});

test('[MOCKED] eval-retrieval: recall@6 and precision@6, including doc-level refs', () => {
  assert.ok(chunkMatchesRef('KB-15.2', 'KB-15'));
  assert.ok(!chunkMatchesRef('KB-150.1', 'KB-15'));
  assert.ok(!chunkMatchesRef('KB-06.71', 'KB-06.7'));

  const s = scoreCase(['KB-06.7', 'KB-02.3'], ['KB-06.7', 'KB-01.1', 'KB-03.2', 'KB-04.4']);
  assert.equal(s.recall, 0.5);
  assert.equal(s.precision, 1 / 6);
  assert.deepEqual(s.missedRefs, ['KB-02.3']);

  const full = scoreCase(['KB-15'], ['KB-15.1', 'KB-15.3', 'KB-02.1']);
  assert.equal(full.recall, 1);
  assert.equal(full.precision, 2 / 6);

  const cutoff = scoreCase(['KB-09.9'], ['a', 'b', 'c', 'd', 'e', 'f', 'KB-09.9']);
  assert.equal(cutoff.recall, 0, 'only the top 6 count');
  assert.equal(scoreCase(['KB-01.1'], []).precision, 0);
  assert.equal(mean([1, 0.5]), 0.75);
});

test('[MOCKED] eval-retrieval: variant A keeps the current SQL; variant B adds pg_trgm similarity on title and section', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql: sql.replace(/\s+/g, ' '), params });
      return {
        rows: [
          { chunk_id: 'KB-02.1', doc_id: 'KB-02', document_title: 'Sponsorship economics', section: 'Signed, invoiced', base_rank: 0.4, trgm_sim: 0.1, text: 't' },
          { chunk_id: 'KB-06.7', doc_id: 'KB-06', document_title: 'Funnel', section: 'Handoff leak', base_rank: 0.3, trgm_sim: 0.6, text: 't' },
        ],
        rowCount: 2,
      };
    },
  } as unknown as QueryablePool;
  const acc = () => ({ metricResults: [], toolResults: [], citations: [], knowledgeTexts: [] }) as never;

  const a = (await executeSearchKnowledge(pool, { query: 'handoff leak' }, 1, acc())) as { rank_mode: string; chunks: Array<{ chunk_id: string }> };
  assert.equal(a.rank_mode, 'fts');
  assert.ok(!calls[0].sql.includes('similarity('));
  assert.deepEqual(calls[0].params, ['handoff leak']);
  assert.deepEqual(a.chunks.map((c) => c.chunk_id), ['KB-02.1', 'KB-06.7']);

  calls.length = 0;
  const b = (await executeSearchKnowledge(pool, { query: 'handoff leak' }, 1, acc(), { rankMode: 'fts_trgm' })) as { rank_mode: string; chunks: Array<{ chunk_id: string }> };
  assert.equal(b.rank_mode, 'fts_trgm');
  assert.match(calls[0].sql, /similarity\(COALESCE\(document_title, ''\), \$2\)/);
  assert.match(calls[0].sql, /similarity\(COALESCE\(section, ''\), \$2\)/);
  assert.match(calls[0].sql, /ORDER BY base_rank \+ GREATEST\(/);
  assert.deepEqual(calls[0].params, ['handoff leak', 'handoff leak']);
  assert.deepEqual(b.chunks.map((c) => c.chunk_id), ['KB-06.7', 'KB-02.1'], 'trigram similarity re-ranks');
});

