import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../../eval/results/retrieval-ranking.json', import.meta.url));
export function getKnowledgeRankMode(): 'fts' | 'fts_trgm' {
  try { const r=JSON.parse(readFileSync(file,'utf8')); return r.mode === 'fts_trgm' ? 'fts_trgm' : 'fts'; }
  catch { return 'fts'; }
}
/** Adopt only a completed comparison, on the same server/database as the evaluator. */
export function adoptKnowledgeRanking(recallA: number, recallB: number | null): 'fts' | 'fts_trgm' {
  if (!Number.isFinite(recallA) || recallA < 0 || recallA > 1 || (recallB !== null && (!Number.isFinite(recallB) || recallB < 0 || recallB > 1))) throw new Error('Invalid retrieval scores');
  const mode = recallB !== null && recallB > recallA ? 'fts_trgm' : 'fts';
  mkdirSync(fileURLToPath(new URL('../../eval/results/',import.meta.url)),{recursive:true});
  writeFileSync(file+'.tmp',JSON.stringify({mode,recall_a:recallA,recall_b:recallB,evaluated_at:new Date().toISOString()},null,2));
  renameSync(file+'.tmp',file); return mode;
}
