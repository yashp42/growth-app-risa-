/** Structured answer blocks returned by /api/ai/ask (mirrors server/llm/answerBlocks.ts). */

export type AnswerColumnFormat = 'text' | 'inr' | 'number' | 'percent' | 'date';

export interface AnswerTableBlock {
  type: 'table';
  title: string;
  columns: Array<{ key: string; label: string; format: AnswerColumnFormat }>;
  rows: Array<Record<string, string | number | null>>;
  source: string;
  data_version: number | string | null;
  edition_id?: string;
  record_class?: string;
}

export interface AnswerBarBlock {
  type: 'bar';
  title: string;
  metric_id: string;
  unit: string | null;
  series: Array<{ label: string; value: number | null; computable: boolean; reason?: string | null }>;
  total?: number | null;
  source: string;
  data_version: number | string | null;
}

export interface AnswerLineBlock {
  type: 'line';
  title: string;
  metric_id: string;
  unit: string | null;
  series: Array<{ x: string; y: number | null }>;
  source: string;
  data_version: number | string | null;
}

export interface AnswerKpiBlock {
  type: 'kpi';
  metric_id: string;
  label: string;
  value: number | null;
  unit: string | null;
  computable: boolean;
  reason?: string | null;
  source: string;
  data_version: number | string | null;
}

export type AnswerBlock = AnswerTableBlock | AnswerBarBlock | AnswerLineBlock | AnswerKpiBlock;

export function isAnswerBlock(v: unknown): v is AnswerBlock {
  if (!v || typeof v !== 'object') return false;
  const t = (v as { type?: unknown }).type;
  return t === 'table' || t === 'bar' || t === 'line' || t === 'kpi';
}
