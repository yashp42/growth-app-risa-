import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// LIVE 2026-11-26T21:05Z: unchanged C recall .656 vs A .585 on 63 cases.
// Keep this measured baseline after a restart; unmeasured D is never the default.
const DEFAULT_MODE = 'fts_enriched' as const;
const file = fileURLToPath(new URL('../../eval/results/retrieval-ranking.json', import.meta.url));
export function getKnowledgeRankMode(): 'fts' | 'fts_trgm' | 'fts_enriched' | 'fts_morph' {
  try { const r=JSON.parse(readFileSync(file,'utf8')); return ['fts','fts_trgm','fts_enriched','fts_morph'].includes(r.mode) ? r.mode : DEFAULT_MODE; }
  catch { return DEFAULT_MODE; }
}
/** Adopt only a completed comparison, on the same server/database as the evaluator. */
export function adoptKnowledgeRanking(recallA: number, recallB: number | null, recallC: number | null = null, recallD: number | null = null): 'fts' | 'fts_trgm' | 'fts_enriched' | 'fts_morph' {
  if (!Number.isFinite(recallA) || recallA < 0 || recallA > 1 || (recallB !== null && (!Number.isFinite(recallB) || recallB < 0 || recallB > 1))) throw new Error('Invalid retrieval scores');
  if (recallC !== null && (!Number.isFinite(recallC) || recallC < 0 || recallC > 1)) throw new Error('Invalid retrieval scores');
  if(recallD!==null&&(!Number.isFinite(recallD)||recallD<0||recallD>1))throw new Error('Invalid retrieval scores');
  const mode = recallD !== null && recallD > Math.max(recallA,recallB??-1,recallC??-1) ? 'fts_morph' : recallC !== null && recallC > Math.max(recallA, recallB ?? -1) ? 'fts_enriched' : recallB !== null && recallB > recallA ? 'fts_trgm' : 'fts';
  mkdirSync(fileURLToPath(new URL('../../eval/results/',import.meta.url)),{recursive:true});
  writeFileSync(file+'.tmp',JSON.stringify({mode,recall_a:recallA,recall_b:recallB,recall_c:recallC,recall_d:recallD,evaluated_at:new Date().toISOString()},null,2));
  renameSync(file+'.tmp',file); return mode;
}
