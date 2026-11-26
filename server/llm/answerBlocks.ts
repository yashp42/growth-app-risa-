/**
 * Structured answer blocks (tables, bar/line charts, KPI tiles) built by the
 * server from this turn's tool results. The model never supplies a number in a
 * block: at most it chooses which kind of block to show, with a trailing
 * "[[blocks: table|chart|kpi|none]]" tag that the server strips from the text.
 */

export type ColumnFormat = 'text' | 'inr' | 'number' | 'percent' | 'date';

export interface TableBlock {
  type: 'table';
  title: string;
  columns: Array<{ key: string; label: string; format: ColumnFormat }>;
  rows: Array<Record<string, string | number | null>>;
  source: string;
  data_version: number | string | null;
  edition_id?: string;
  record_class?: string;
}

export interface BarBlock {
  type: 'bar';
  title: string;
  metric_id: string;
  unit: string | null;
  series: Array<{ label: string; value: number | null; computable: boolean; reason?: string | null }>;
  total?: number | null;
  source: string;
  data_version: number | string | null;
}

export interface LineBlock {
  type: 'line';
  title: string;
  metric_id: string;
  unit: string | null;
  series: Array<{ x: string; y: number | null }>;
  source: string;
  data_version: number | string | null;
}

export interface KpiBlock {
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

export type AnswerBlock = TableBlock | BarBlock | LineBlock | KpiBlock;
export type BlockChoice = 'table' | 'chart' | 'kpi' | 'none' | 'auto';

const MAX_TABLE_ROWS = 25;

type Col = TableBlock['columns'][number];
const COLUMNS_BY_KIND: Record<string, Col[]> = {
  receivables: [
    { key: 'sponsor_name', label: 'Sponsor', format: 'text' },
    { key: 'contract_id', label: 'Contract', format: 'text' },
    { key: 'payment_terms', label: 'Terms', format: 'text' },
    { key: 'cash_signed', label: 'Signed cash', format: 'inr' },
    { key: 'cash_received', label: 'Received', format: 'inr' },
    { key: 'outstanding', label: 'Outstanding', format: 'inr' },
    { key: 'overdue_amount', label: 'Overdue', format: 'inr' },
  ],
  opportunities: [
    { key: 'name', label: 'Opportunity', format: 'text' },
    { key: 'sponsor_name', label: 'Sponsor', format: 'text' },
    { key: 'stage', label: 'Stage', format: 'text' },
    { key: 'proposed_value', label: 'Proposed', format: 'inr' },
    { key: 'confirmed_value', label: 'Confirmed', format: 'inr' },
    { key: 'owner_name', label: 'Owner', format: 'text' },
  ],
  tasks: [
    { key: 'title', label: 'Task', format: 'text' },
    { key: 'task_type', label: 'Type', format: 'text' },
    { key: 'status', label: 'Status', format: 'text' },
    { key: 'owner_name', label: 'Owner', format: 'text' },
    { key: 'due_at', label: 'Due', format: 'date' },
  ],
  sponsors: [
    { key: 'display_name', label: 'Sponsor', format: 'text' },
    { key: 'lifecycle_status', label: 'Status', format: 'text' },
    { key: 'city', label: 'City', format: 'text' },
    { key: 'owner_name', label: 'Owner', format: 'text' },
  ],
  campaigns: [
    { key: 'name', label: 'Campaign', format: 'text' },
    { key: 'channel_group', label: 'Channel', format: 'text' },
    { key: 'status', label: 'Status', format: 'text' },
  ],
  contacts: [
    { key: 'full_name', label: 'Contact', format: 'text' },
    { key: 'job_title', label: 'Title', format: 'text' },
    { key: 'sponsor_name', label: 'Sponsor', format: 'text' },
  ],
  team_members: [
    { key: 'full_name', label: 'Member', format: 'text' },
    { key: 'member_id', label: 'ID', format: 'text' },
  ],
};

const KIND_TITLES: Record<string, string> = {
  receivables: 'Receivables by active contract',
  opportunities: 'Opportunities',
  tasks: 'Tasks',
  sponsors: 'Sponsors',
  campaigns: 'Campaigns',
  contacts: 'Contacts',
  team_members: 'Team members',
};

const STATE_TITLES: Record<string, string> = {
  open: 'Open deals',
  confirmed: 'Signed partnerships',
  lost: 'Lost deals',
};

const METRIC_LABELS: Record<string, string> = {
  'M-01': 'Cash collected',
  'M-02': 'Signed value',
  'M-03': 'Signed cash',
  'M-04': 'Signed in-kind',
  'M-06': 'Collected ÷ signed cash',
  'M-07': 'Outstanding cash',
  'M-08': 'Cumulative collected (pacing)',
  'M-21': 'Open pipeline',
  'M-30': 'Approved target',
};

function metricLabel(id: string): string {
  return METRIC_LABELS[id] ?? id;
}

function inferFormat(key: string, sample: unknown): ColumnFormat {
  if (/(value|amount|cash|outstanding|received|total|overdue)/.test(key) && typeof sample === 'number') return 'inr';
  if (/(_at|_date|^date)$/.test(key)) return 'date';
  if (typeof sample === 'number') return 'number';
  return 'text';
}

function toCell(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim().length < 16) return Number(v);
  if (typeof v === 'object') return null;
  return String(v);
}

function tableFromList(r: Record<string, unknown>): TableBlock | null {
  const rows = Array.isArray(r.rows) ? (r.rows as Array<Record<string, unknown>>) : [];
  if (rows.length === 0) return null;
  const kind = String(r.kind ?? String(r.source ?? '').replace(/^list_/, ''));
  let columns = (COLUMNS_BY_KIND[kind] ?? []).filter((c) => rows.some((row) => c.key in row));
  if (columns.length === 0) {
    columns = Object.keys(rows[0])
      .filter((k) => !/(^id$|_hash$|import_batch|evidence_class|is_deleted)/.test(k))
      .slice(0, 6)
      .map((k) => ({ key: k, label: k.replace(/_/g, ' '), format: inferFormat(k, rows[0][k]) }));
  }
  const state = typeof r.state === 'string' ? r.state : undefined;
  return {
    type: 'table',
    title: (kind === 'opportunities' && state && STATE_TITLES[state]) || KIND_TITLES[kind] || kind,
    columns,
    rows: rows.slice(0, MAX_TABLE_ROWS).map((row) =>
      Object.fromEntries(columns.map((c) => [c.key, toCell(row[c.key])]))
    ),
    source: String(r.source ?? 'list_records'),
    data_version: (r.data_version as number | string | null | undefined) ?? null,
    edition_id: r.edition_id as string | undefined,
    record_class: r.record_class as string | undefined,
  };
}

function lineFromSeries(r: Record<string, unknown>): LineBlock | null {
  const series = Array.isArray(r.series) ? (r.series as Array<{ as_of: string; rows: Array<Record<string, unknown>> }>) : [];
  if (series.length === 0) return null;
  const metricId = String(r.metric_id ?? '');
  const first = series.find((s) => s.rows?.[0])?.rows?.[0];
  return {
    type: 'line',
    title: `${metricLabel(metricId)} by week`,
    metric_id: metricId,
    unit: (first?.unit as string | null | undefined) ?? null,
    series: series.map((s) => {
      const m = s.rows?.[0];
      const y = m && m.computable !== false && typeof m.value === 'number' ? (m.value as number) : null;
      return { x: s.as_of, y };
    }),
    source: String(r.source ?? 'metrics.get_metric_series'),
    data_version: (r.data_version as number | string | null | undefined) ?? null,
  };
}

interface MetricLike {
  metric_id: string;
  value: number | null;
  unit: string | null;
  computable: boolean;
  reason?: string | null;
  applied_filters?: Record<string, unknown> | null;
  data_version?: number | string | null;
}

/** Several results of one metric that differ only by one filter -> a bar chart. */
function barFromMetricGroup(metrics: MetricLike[]): BarBlock | null {
  const byMetric = new Map<string, MetricLike[]>();
  for (const m of metrics) {
    const list = byMetric.get(m.metric_id) ?? [];
    list.push(m);
    byMetric.set(m.metric_id, list);
  }
  for (const [metricId, list] of byMetric) {
    if (list.length < 2) continue;
    for (const dim of ['campaign_id', 'channel_group', 'bet_id']) {
      const grouped = list.filter((m) => m.applied_filters && typeof m.applied_filters[dim] === 'string');
      if (grouped.length >= 2) {
        return {
          type: 'bar',
          title: `${metricLabel(metricId)} by ${dim.replace(/_id$/, '').replace(/_/g, ' ')}`,
          metric_id: metricId,
          unit: grouped[0].unit,
          series: grouped.map((m) => ({
            label: String(m.applied_filters![dim]),
            value: m.computable ? m.value : null,
            computable: m.computable,
            reason: m.reason ?? null,
          })),
          source: 'metrics.get_metric',
          data_version: grouped[0].data_version ?? null,
        };
      }
    }
  }
  return null;
}

function blocksFromView(viewSpec: Record<string, unknown> | undefined): AnswerBlock[] {
  if (!viewSpec || !Array.isArray(viewSpec.widgets)) return [];
  const out: AnswerBlock[] = [];
  const dv = (viewSpec.data_version as number | string | null | undefined) ?? null;
  for (const w of viewSpec.widgets as Array<Record<string, unknown>>) {
    const rows = Array.isArray(w.rows) ? (w.rows as Array<Record<string, unknown>>) : [];
    if (w.kind === 'metric_by' && rows.length > 0) {
      out.push({
        type: 'bar',
        title: String(w.title ?? `${metricLabel(String(w.metric_id))} by ${String(w.group_by)}`),
        metric_id: String(w.metric_id ?? ''),
        unit: (w.unit as string | null | undefined) ?? null,
        total: typeof w.total_value === 'number' ? (w.total_value as number) : null,
        series: rows.map((r) => ({
          label: String(r.label ?? r.key ?? ''),
          value: r.computable === false || typeof r.value !== 'number' ? null : (r.value as number),
          computable: r.computable !== false,
          reason: (r.reason as string | null | undefined) ?? null,
        })),
        source: 'set_view · metrics.get_metric',
        data_version: dv,
      });
    } else if (w.kind === 'series' && rows.length > 0) {
      out.push({
        type: 'line',
        title: String(w.title ?? metricLabel(String(w.metric_id))),
        metric_id: String(w.metric_id ?? ''),
        unit: (rows[0].unit as string | null | undefined) ?? null,
        series: rows.map((r) => ({
          x: String(r.as_of ?? ''),
          y: r.computable === false || typeof r.value !== 'number' ? null : (r.value as number),
        })),
        source: 'set_view · metrics.get_metric_series',
        data_version: dv,
      });
    }
  }
  return out;
}

const DIRECTIVE_RE = /\s*\[\[\s*blocks?\s*:\s*(table|chart|kpi|none|auto)\s*\]\]\s*$/i;

/** Strip the model's optional trailing block choice from the answer text. */
export function extractBlockChoice(answer: string): { answer: string; choice: BlockChoice } {
  const m = DIRECTIVE_RE.exec(answer);
  if (!m) return { answer, choice: 'auto' };
  return { answer: answer.slice(0, m.index).trimEnd(), choice: m[1].toLowerCase() as BlockChoice };
}

export function buildAnswerBlocks(params: {
  toolResults: unknown[];
  metricResults: MetricLike[];
  viewSpec?: Record<string, unknown>;
  choice: BlockChoice;
  answerHasMarkdownTable?: boolean;
}): AnswerBlock[] {
  if (params.choice === 'none') return [];
  const tables: AnswerBlock[] = [];
  const charts: AnswerBlock[] = [];

  for (const raw of params.toolResults) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.source === 'string' && r.source.startsWith('list_')) {
      const t = tableFromList(r);
      if (t) tables.push(t);
    } else if (r.source === 'metrics.get_metric_series') {
      const l = lineFromSeries(r);
      if (l) charts.push(l);
    }
  }
  charts.push(...blocksFromView(params.viewSpec));
  const bar = barFromMetricGroup(params.metricResults);
  if (bar && !charts.some((c) => c.type === 'bar' && c.metric_id === bar.metric_id)) charts.push(bar);

  const kpis: AnswerBlock[] = params.metricResults
    .filter((m) => !m.applied_filters || Object.keys(m.applied_filters).length === 0)
    .slice(0, 4)
    .map((m) => ({
      type: 'kpi' as const,
      metric_id: m.metric_id,
      label: metricLabel(m.metric_id),
      value: m.computable ? m.value : null,
      unit: m.unit,
      computable: m.computable,
      reason: m.reason ?? null,
      source: 'metrics.get_metric',
      data_version: m.data_version ?? null,
    }));

  const tableBlocks = params.answerHasMarkdownTable ? [] : tables;
  switch (params.choice) {
    case 'table':
      return tableBlocks;
    case 'chart':
      return charts;
    case 'kpi':
      return kpis;
    default:
      if (tableBlocks.length > 0 || charts.length > 0) return [...charts, ...tableBlocks];
      return kpis.length > 1 ? kpis : [];
  }
}
