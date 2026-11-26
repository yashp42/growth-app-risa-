import type { QueryablePool } from './tools.ts';

type Scalar = string | number | boolean | null;
export interface DatasetArgs {
  dataset_id: string;
  filter?: Record<string, Scalar>;
  columns?: string[];
  limit?: number;
}
export interface ReferenceContext { asOf: string; dataVersion: number }
interface DatasetMetadata {
  dataset_id: string; title: string; source_path: string; sheet: string | null;
  status: string; record_class: string; row_count: number;
  columns: string[]; source_sha256: string; note: string | null;
}

/** Pure reads: hidden datasets are filtered out in BOTH metadata and row queries. */
export async function getDataset(pool: QueryablePool, args: DatasetArgs, ctx: ReferenceContext): Promise<Record<string, unknown>> {
  const limit = args.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('limit must be between 1 and 50');
  const metadata = await pool.query<DatasetMetadata>(
    `SELECT dataset_id, title, source_path, sheet, status, record_class,
            row_count, columns, source_sha256, note
       FROM ref.dataset WHERE dataset_id = $1 AND ai_visible = true`, [args.dataset_id]);
  const dataset = metadata.rows[0];
  if (!dataset) return { source: 'ref.dataset_row', available: false, message: 'Not available to the assistant' };
  const columns = args.columns ?? dataset.columns;
  const allowed = new Set(dataset.columns);
  if (columns.some((key) => !allowed.has(key)) || Object.keys(args.filter ?? {}).some((key) => !allowed.has(key))) {
    throw new Error('Unknown dataset column');
  }
  const result = await pool.query<{ row_no: number; data: Record<string, unknown> }>(
    `SELECT r.row_no, r.data FROM ref.dataset_row r
       JOIN ref.dataset d ON d.dataset_id = r.dataset_id AND d.ai_visible = true
      WHERE r.dataset_id = $1 AND r.data @> $2::jsonb
      ORDER BY r.row_no LIMIT $3`, [args.dataset_id, JSON.stringify(args.filter ?? {}), limit + 1]);
  return {
    ...dataset, source: 'ref.dataset_row', kind: 'dataset', available: true,
    status_label: referenceStatus(dataset.record_class, dataset.status, dataset.dataset_id),
    as_of: ctx.asOf, edition_id: 'REFERENCE', data_version: ctx.dataVersion,
    columns, truncated: result.rows.length > limit,
    rows: result.rows.slice(0, limit).map(({ data }) => Object.fromEntries(columns.map((key) => [key, data[key] ?? null]))),
  };
}

export async function listDatasets(pool: QueryablePool, query: string, ctx: ReferenceContext): Promise<Record<string, unknown>> {
  const result = await pool.query<DatasetMetadata>(
    `SELECT dataset_id, title, status, record_class, row_count, source_path, source_sha256
       FROM ref.dataset
      WHERE ai_visible = true AND ($1 = '' OR dataset_id ILIKE $2 ESCAPE '\\' OR title ILIKE $2 ESCAPE '\\' OR to_tsvector('english', replace(dataset_id, '.', ' ') || ' ' || title) @@ plainto_tsquery('english', $1))
      ORDER BY dataset_id LIMIT 100`, [query, `%${query.replace(/[\\%_]/g, '\\$&')}%`]);
  return { source: 'list_datasets', kind: 'datasets', as_of: ctx.asOf, edition_id: 'REFERENCE',
    record_class: 'reference_catalogue', data_version: ctx.dataVersion,
    rows: result.rows.map((r) => ({ ...r, status_label: referenceStatus(r.record_class, r.status, r.dataset_id) })) };
}

export function referenceStatus(recordClass: string, status: string, datasetId = ''): string {
  if (/external_research/i.test(recordClass) || /prospect_register|external_benchmarks|market_research/.test(datasetId)) return 'External research, not pipeline or forecast';
  if (/not.?approved|analysis|option|proposed/i.test(status)) return 'Analysis, not approved';
  if (recordClass === 'model_output') return 'Frozen model output; not operational pipeline';
  return status;
}
