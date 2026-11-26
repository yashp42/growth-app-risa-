/**
 * Retrieval quality score (Stage 4D §3 / Part 4C addition). Uses no AI requests.
 *
 * For every test-bank case whose expected_citation names a KB chunk, calls
 * search_knowledge directly (no model) with the case's question as the query
 * (include_history=true for Contradiction-handling cases) and computes
 * recall@6 and precision@6. Runs two variants:
 *   A) current search: strict websearch FTS + OR fallback + title boost;
 *   B) A plus pg_trgm similarity on document title and section (skipped, and
 *      reported, if the pg_trgm extension is not enabled).
 *
 * LIVE only: needs DATABASE_URL (the app_service pooler URL). Usage:
 *   npx tsx scripts/eval-retrieval.ts            # prints a report
 *   npx tsx scripts/eval-retrieval.ts --write    # also writes eval/results/retrieval-<date>.{md,json}
 */
import { adoptKnowledgeRanking } from '../server/llm/retrievalRanking.ts';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerConfig } from '../server/config.ts';
import { closeDatabasePool, createDatabasePool } from '../server/db.ts';
import {
  executeSearchKnowledge,
  type KnowledgeRankMode,
  type QueryablePool,
} from '../server/llm/tools.ts';
import { expectedKbRefs, mean, parseCsv, scoreCase, type CaseScore } from './lib/retrievalMetrics.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = 6;

interface CaseRow {
  test_id: string;
  category: string;
  user_query: string;
  expected_citation: string;
}

interface CaseResult extends CaseScore {
  test_id: string;
  category: string;
  query: string;
  include_history: boolean;
  expected: string[];
  retrieved: string[];
  used_or_fallback: boolean;
}

function emptyAcc() {
  return { metricResults: [], toolResults: [], citations: [], knowledgeTexts: [] } as unknown as Parameters<
    typeof executeSearchKnowledge
  >[3];
}

async function runVariant(pool: QueryablePool, cases: CaseRow[], rankMode: KnowledgeRankMode): Promise<CaseResult[]> {
  const out: CaseResult[] = [];
  for (const c of cases) {
    const includeHistory = c.category.toLowerCase() === 'contradiction handling';
    const res = (await executeSearchKnowledge(
      pool,
      { query: c.user_query, include_history: includeHistory },
      0,
      emptyAcc(),
      { rankMode }
    )) as { chunks: Array<{ chunk_id: string }>; used_or_fallback: boolean };
    const retrieved = res.chunks.map((ch) => ch.chunk_id);
    const expected = expectedKbRefs(c.expected_citation);
    out.push({
      test_id: c.test_id,
      category: c.category,
      query: c.user_query,
      include_history: includeHistory,
      expected,
      retrieved,
      used_or_fallback: res.used_or_fallback,
      ...scoreCase(expected, retrieved, K),
    });
  }
  return out;
}

function summarise(label: string, results: CaseResult[]): string {
  const lines: string[] = [];
  lines.push(`### ${label}`);
  lines.push('');
  lines.push(`Cases: ${results.length} · mean recall@${K}: **${mean(results.map((r) => r.recall)).toFixed(3)}** · mean precision@${K}: **${mean(results.map((r) => r.precision)).toFixed(3)}**`);
  lines.push('');
  lines.push(`| Case | Category | Expected | Recall@${K} | Precision@${K} | OR fallback |`);
  lines.push('|---|---|---|---:|---:|---|');
  for (const r of results) {
    lines.push(`| ${r.test_id} | ${r.category} | ${r.expected.join(', ')} | ${r.recall.toFixed(2)} | ${r.precision.toFixed(2)} | ${r.used_or_fallback ? 'yes' : 'no'} |`);
  }
  const misses = results.filter((r) => r.recall < 1);
  lines.push('');
  lines.push(`**Cases with recall below 1.0 (${misses.length}):**`);
  lines.push('');
  if (misses.length === 0) lines.push('None.');
  for (const r of misses) {
    lines.push(`- ${r.test_id} (${r.category}): missed ${r.missedRefs.join(', ')}; retrieved instead: ${r.retrieved.join(', ') || 'nothing'}. Query: "${r.query}"`);
  }
  lines.push('');
  return lines.join('\n');
}

export async function runRetrievalEvaluation(adopt = false): Promise<{ report: string; results: Record<string, unknown> }> {
  const config = loadServerConfig();
  if (!config.databaseUrl) {
    console.error('DATABASE_URL is not set: eval-retrieval is a LIVE check and needs the database.');
    process.exit(2);
  }
  const dbState = createDatabasePool(config);
  if (!dbState.pool) {
    console.error('Database pool could not be created.');
    process.exit(2);
  }
  try {
  const pool = dbState.pool as unknown as QueryablePool;

  const bank = parseCsv(readFileSync(path.join(ROOT, 'eval/chatbot_test_bank.csv'), 'utf8')) as unknown as CaseRow[];
  const cases = bank.filter((c) => expectedKbRefs(c.expected_citation ?? '').length > 0);

  const trgmRes = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS ok`
  );
  const trgmEnabled = Boolean(trgmRes.rows[0]?.ok);

  const a = await runVariant(pool, cases, 'fts');
  const b = trgmEnabled ? await runVariant(pool, cases, 'fts_trgm') : null;

  const c = await runVariant(pool, cases, 'fts_enriched');
  const d = await runVariant(pool, cases, 'fts_morph');
  const recallD = mean(d.map(r=>r.recall));
  const recallC = mean(c.map(r=>r.recall));
  const recallA = mean(a.map((r) => r.recall));
  const recallB = b ? mean(b.map((r) => r.recall)) : null;
  const winner = recallD > Math.max(recallA,recallB??-1,recallC) ? 'D (normalised lexical ranking)' : recallC > Math.max(recallA,recallB ?? -1) ? 'C (expanded lexical search)' : recallB !== null && recallB > recallA ? 'B (FTS + pg_trgm)' : 'A (current FTS + OR fallback)';

  const report = [
    `# Retrieval quality (LIVE, ${new Date().toISOString()})`,
    '',
    `Test-bank cases with a KB citation: ${cases.length} of ${bank.length}. k = ${K}. No AI requests used.`,
    '',
    summarise('Variant A: current search (strict FTS + OR fallback + title boost)', a),
    b
      ? summarise('Variant B: A + pg_trgm similarity on title and section', b)
      : '### Variant B\n\npg_trgm is **not enabled** in this database, so variant B was not run. Enable it (Supabase: Database → Extensions → pg_trgm) to compare.\n',
    summarise('Variant C: meaningful terms, domain synonyms and chunk-text ranking', c),
    summarise('Variant D: morphological terms, length normalisation and result diversity', d),
    `## Verdict`,
    '',
    `Mean recall@${K}: A = ${recallA.toFixed(3)}${recallB !== null ? `, B = ${recallB.toFixed(3)}` : ', B = not run'}, C = ${recallC.toFixed(3)}, D = ${recallD.toFixed(3)}. Keep: **${winner}**.`,
    adopt ? 'The winning variant has been adopted on this server (ties keep FTS).' : 'Run with --adopt to use the winning variant on this server.',
    '',
  ].join('\n');

  if (adopt) adoptKnowledgeRanking(recallA, recallB, recallC, recallD);
  const results = { k: K, trgm_enabled: trgmEnabled, variant_a: a, variant_b: b, variant_c: c, variant_d: d, winner };
  console.log(report);
  if (process.argv.includes('--write')) {
    const dir = path.join(ROOT, 'eval/results');
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    writeFileSync(path.join(dir, `retrieval-${stamp}.md`), report);
    writeFileSync(
      path.join(dir, `retrieval-${stamp}.json`),
      JSON.stringify({ k: K, trgm_enabled: trgmEnabled, variant_a: a, variant_b: b, variant_c: c, variant_d: d, winner }, null, 2)
    );
    console.log(`Wrote eval/results/retrieval-${stamp}.md and .json`);
  }
  return { report, results };
  } finally { await closeDatabasePool(dbState); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runRetrievalEvaluation(process.argv.includes('--adopt')).catch((err) => {
  console.error(`[eval-retrieval] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

