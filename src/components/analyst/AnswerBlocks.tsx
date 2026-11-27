import { businessText } from '../../lib/businessCopy';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatInr, formatInrLakh, formatIstDateTime } from '../../lib/displayFormat';
import type {
  AnswerBarBlock,
  AnswerBlock,
  AnswerColumnFormat,
  AnswerKpiBlock,
  AnswerLineBlock,
  AnswerTableBlock,
} from '../../types/answerBlocks';

/**
 * Renders server-built answer blocks. Every number shown here came from a tool
 * result on the server; this component only formats and sorts.
 */

function formatCell(value: string | number | null | undefined, format: AnswerColumnFormat): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (format) {
    case 'inr':
      return formatInr(value);
    case 'number':
      return typeof value === 'number' ? value.toLocaleString('en-IN') : String(value);
    case 'percent': {
      const n = Number(value);
      return Number.isFinite(n) ? `${n.toFixed(1)}%` : String(value);
    }
    case 'date':
      return typeof value === 'string' ? formatIstDateTime(value.length > 10 ? value : value.slice(0, 10)) : String(value);
    default:
      return String(value).replace(/_/g, ' ');
  }
}

function formatMetricValue(value: number | null, unit: string | null): string {
  if (value === null) return '—';
  if (unit === 'INR' || unit === '₹') return formatInr(value);
  if (unit === 'ratio') return `${(value * 100).toFixed(1)}%`;
  if (unit === '%') return `${value.toFixed(1)}%`;
  return `${value.toLocaleString('en-IN')}${unit ? ` ${unit}` : ''}`;
}

function BlockFrame({
  title,
  children,
}: {
  title: string;
  source: string;
  dataVersion: number | string | null;
  children: React.ReactNode;
}) {
  return (
    <figure className="rounded-md border border-[var(--color-border)] bg-white p-3.5">
      <figcaption className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[14px] font-semibold text-[var(--color-ink)]">{businessText(title)}</span>
      </figcaption>
      {children}
    </figure>
  );
}

export function TableBlockView({ block }: { block: AnswerTableBlock }) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const rows = useMemo(() => {
    if (!sort) return block.rows;
    const copy = [...block.rows];
    copy.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'en-IN', { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [block.rows, sort]);

  const toggle = (key: string) =>
    setSort((prev) =>
      prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }
    );

  return (
    <BlockFrame title={block.title} source={block.source} dataVersion={block.data_version}>
      {block.status ? <p className="mb-2 text-[12px] text-[var(--color-ink-muted)]">{block.status}</p> : null}
      {block.source_path ? <details className="source-details mb-2"><summary>File source</summary><p>{block.source_path}{block.source_sha256 ? ' · SHA-256 ' + block.source_sha256 : ''}</p></details> : null}
      <div className="overflow-x-auto rounded border border-[var(--color-border-subtle)]">
        <table className="min-w-full divide-y divide-[var(--color-border-subtle)] text-left text-[13px]">
          <thead className="bg-[var(--color-surface-subtle)] text-[12px] text-[var(--color-ink-subtle)]">
            <tr>
              {block.columns.map((c) => {
                const active = sort?.key === c.key;
                const numeric = c.format === 'inr' || c.format === 'number' || c.format === 'percent';
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`px-3 py-2 font-medium ${numeric ? 'text-right' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className="inline-flex items-center gap-1 whitespace-nowrap hover:text-[var(--color-ink)]"
                    >
                      {c.label}
                      {active ? (
                        sort!.dir === 'asc' ? (
                          <ArrowUp className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="h-3 w-3" aria-hidden="true" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0EEE8]">
            {rows.map((row, i) => (
              <tr key={i}>
                {block.columns.map((c) => {
                  const numeric = c.format === 'inr' || c.format === 'number' || c.format === 'percent';
                  return (
                    <td
                      key={c.key}
                      className={`px-3 py-1.5 text-[var(--color-ink)] ${numeric ? 'text-right font-mono tabular-nums' : ''}`}
                    >
                      {c.key === 'stage' ? ({ negotiating: 'Negotiating', proposal_sent: 'Proposal sent', prospecting: 'Prospecting', contacted: 'Contacted', partner_confirmed: 'Partner confirmed' }[String(row[c.key])] ?? formatCell(row[c.key], c.format)) : formatCell(row[c.key], c.format)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[12px] text-[var(--color-ink-subtle)]">
        {block.rows.length} {block.rows.length === 1 ? 'row' : 'rows'}{block.truncated ? ' shown; more rows available — narrow the filter' : ''}
        {block.edition_id ? ` · ${block.edition_id}` : ''} · click a column to sort
      </p>
    </BlockFrame>
  );
}

export function BarBlockView({ block }: { block: AnswerBarBlock }) {
  const max = block.series.reduce((m, s) => (s.value !== null && s.value > m ? s.value : m), 0);
  return (
    <BlockFrame title={block.title} source={block.source} dataVersion={block.data_version}>
      {block.total !== null && block.total !== undefined ? (
        <p className="mb-2 text-[12px] text-[var(--color-ink-muted)]">
          Total: <span className="font-mono font-semibold text-[var(--color-ink)]">{formatMetricValue(block.total, block.unit)}</span>
        </p>
      ) : null}
      <ul className="space-y-2" aria-label={`${block.title} bar chart`}>
        {block.series.map((s, i) => {
          const pct = max > 0 && s.value !== null && s.value > 0 ? Math.max(3, (s.value / max) * 100) : 0;
          return (
            <li key={`${s.label}-${i}`} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate text-[var(--color-ink)]">{s.label}</span>
                <span className="shrink-0 font-mono tabular-nums text-[var(--color-ink)]">
                  {s.computable ? formatMetricValue(s.value, block.unit) : s.reason || 'Not computable'}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-sm bg-[var(--color-canvas)]">
                <div className="h-full origin-left bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </BlockFrame>
  );
}

export function LineBlockView({ block }: { block: AnswerLineBlock }) {
  // viewBox close to the rendered width so labels stay ~10px in wide panels.
  const W = 720;
  const H = 170;
  const PAD = { l: 8, r: 8, t: 10, b: 22 };
  const points = block.series;
  const ys = points.map((p) => p.y).filter((y): y is number => y !== null);
  const maxY = ys.length ? Math.max(...ys) : 0;
  const minY = 0;
  const x = (i: number) => PAD.l + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (maxY === minY ? 0.5 : 1 - (v - minY) / (maxY - minY)) * (H - PAD.t - PAD.b);
  const paths: string[] = [];
  let segment: string[] = [];
  for (const [i, point] of points.entries()) {
    if (point.y === null) { if (segment.length) paths.push(segment.join(' ')); segment = []; }
    else segment.push(x(i).toFixed(1) + ',' + y(point.y).toFixed(1));
  }
  if (segment.length) paths.push(segment.join(' '));
  const last = [...points].reverse().find((p) => p.y !== null);

  return (
    <BlockFrame title={block.title} source={block.source} dataVersion={block.data_version}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${block.title} line chart`}>
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--color-border-subtle)" />
        {paths.map((points, i) => <polyline key={i} points={points} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" />)}
        {points.map((p, i) =>
          p.y === null ? null : (
            <circle key={p.x} cx={x(i)} cy={y(p.y)} r={3} fill="var(--color-accent)">
              <title>{`${p.x}: ${formatMetricValue(p.y, block.unit)}`}</title>
            </circle>
          )
        )}
        {points.map((p, i) =>
          i === 0 || i === points.length - 1 || points.length <= 6 ? (
            <text key={`t-${p.x}`} x={x(i)} y={H - 6} fontSize={10} fill="var(--color-ink-subtle)" textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
              {p.x.slice(5)}
            </text>
          ) : null
        )}
      </svg>
      {last ? (
        <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
          Latest ({last.x}): <span className="font-mono font-semibold text-[var(--color-ink)]">{formatMetricValue(last.y, block.unit)}</span>
        </p>
      ) : null}
    </BlockFrame>
  );
}

export function KpiBlockView({ block }: { block: AnswerKpiBlock }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-white p-3">
      <p className="text-[12px] text-[var(--color-ink-muted)]">
        {businessText(block.label)}
      </p>
      <p className="mt-0.5 font-mono text-[18px] font-semibold tabular-nums text-[var(--color-ink)]">
        {block.computable ? (block.unit === 'INR' && block.value !== null && Math.abs(block.value) >= 1e5 ? formatInrLakh(block.value) : formatMetricValue(block.value, block.unit)) : 'Not computable'}
      </p>
      {block.computable && block.unit === 'INR' && block.value !== null && Math.abs(block.value) >= 1e5 ? (
        <p className="font-mono text-[12px] text-[var(--color-ink-subtle)]">{formatInr(block.value)}</p>
      ) : null}
      {!block.computable && block.reason ? <p className="mt-0.5 text-[12px] text-[var(--color-ink-muted)]">{block.reason}</p> : null}
    </div>
  );
}

export function AnswerBlocks({ blocks }: { blocks: AnswerBlock[] }) {
  if (blocks.length === 0) return null;
  const kpis = blocks.filter((b): b is AnswerKpiBlock => b.type === 'kpi');
  const others = blocks.filter((b) => b.type !== 'kpi');
  return (
    <div className="mt-3 space-y-3">
      {kpis.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {kpis.map((k) => (
            <KpiBlockView key={k.metric_id} block={k} />
          ))}
        </div>
      ) : null}
      {others.map((b, i) =>
        b.type === 'table' ? (
          <TableBlockView key={`t-${i}`} block={b} />
        ) : b.type === 'bar' ? (
          <BarBlockView key={`b-${i}`} block={b} />
        ) : b.type === 'line' ? (
          <LineBlockView key={`l-${i}`} block={b} />
        ) : null
      )}
    </div>
  );
}
