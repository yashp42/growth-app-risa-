import { ArrowUpRight, Check, Lock, RotateCcw, X } from 'lucide-react';
import { formatRecordClassLabel } from '../../services/analystApi';
import type { AiViewSpec, AiViewWidgetSpec } from '../../types/analyst';
import { MetricEvidenceCard } from './MetricEvidenceCard';

interface AiViewRendererProps {
  viewSpec: AiViewSpec;
  isPreview?: boolean;
  onKeepView?: () => void;
  onUndoView?: () => void;
  onClearView: () => void;
  onOpenScreen?: (
    screen: AiViewSpec['screen'],
    filters?: Record<string, string>
  ) => void;
  compact?: boolean;
}

function formatWidgetValue(value: unknown, unit?: string | null): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  if (unit === 'INR' || unit === '₹') {
    return `₹${num.toLocaleString('en-IN')}`;
  }
  if (unit === 'ratio' || unit === '%') {
    const pct = num <= 1 ? num * 100 : num;
    return `${pct.toFixed(1)}%`;
  }
  return `${num.toLocaleString('en-IN')}${unit ? ` ${unit}` : ''}`;
}

function formatScreenName(screen: AiViewSpec['screen']): string {
  switch (screen) {
    case 'overview':
      return 'Overview';
    case 'campaigns':
      return 'Campaigns';
    case 'sponsors':
      return 'Sponsors';
    case 'pipeline':
      return 'Pipeline';
    case 'collections':
      return 'Collections';
    case 'tasks':
      return 'Tasks';
    case 'analytics':
      return 'Analytics';
  }
}

function MetricByWidget({ widget }: { widget: AiViewWidgetSpec }) {
  const rows = widget.rows ?? [];
  const maxVal = rows.reduce((max, row) => {
    const v = Number(row.value ?? 0);
    return Number.isFinite(v) && v > max ? v : max;
  }, 0);

  return (
    <div className="rounded-md border border-[#D9D7D0] bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#E8E6E0] pb-2.5">
        <div>
          <h4 className="text-[13px] font-semibold text-[#202824]">
            {widget.title}
          </h4>
          <p className="font-mono text-[11px] text-[#788C83]">
            {widget.metric_id ?? 'Metric'} · grouped by {widget.group_by ?? 'group'}
          </p>
        </div>
        {widget.total_value !== undefined && widget.total_value !== null ? (
          <div className="text-right">
            <span className="block font-mono text-[10px] uppercase tracking-wide text-[#788C83]">
              Total
            </span>
            <span className="font-mono text-[14px] font-semibold tabular-nums text-[#202824]">
              {formatWidgetValue(widget.total_value, widget.unit)}
            </span>
          </div>
        ) : null}
      </div>

      {widget.computable === false ? (
        <p className="mt-3 text-[12px] text-[#525E58]">
          {widget.reason || 'Underlying data is unavailable for this scope.'}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-[12px] text-[#788C83]">
          No breakdown rows returned.
        </p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {rows.map((row, idx) => {
            const label = String(row.label ?? row.key ?? `Row ${idx + 1}`);
            const rawVal = row.value;
            const numVal = Number(rawVal ?? 0);
            const pctWidth =
              maxVal > 0 && Number.isFinite(numVal) && numVal > 0
                ? Math.max(4, Math.round((numVal / maxVal) * 100))
                : 0;
            const sharePct =
              widget.total_value &&
              Number(widget.total_value) > 0 &&
              Number.isFinite(numVal)
                ? ((numVal / Number(widget.total_value)) * 100).toFixed(1)
                : null;

            return (
              <div key={`${String(row.key ?? idx)}-${idx}`} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-[12px]">
                  <span className="truncate font-medium text-[#202824]">
                    {label}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-[#202824]">
                    {row.computable === false
                      ? 'Restricted'
                      : formatWidgetValue(
                          rawVal,
                          (row.unit as string | null | undefined) ?? widget.unit
                        )}
                    {sharePct !== null && row.computable !== false ? (
                      <span className="ml-1.5 text-[11px] text-[#788C83]">
                        ({sharePct}%)
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-sm bg-[#F3F1EB]">
                  <div
                    className="h-full bg-[#315F52] transition-all duration-200"
                    style={{ width: `${pctWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SeriesWidget({ widget }: { widget: AiViewWidgetSpec }) {
  const rows = widget.rows ?? [];
  const maxVal = rows.reduce((max, row) => {
    const v = Number(row.value ?? 0);
    return Number.isFinite(v) && v > max ? v : max;
  }, 0);

  return (
    <div className="rounded-md border border-[#D9D7D0] bg-white p-4">
      <div className="flex items-baseline justify-between gap-2 border-b border-[#E8E6E0] pb-2.5">
        <h4 className="text-[13px] font-semibold text-[#202824]">
          {widget.title}
        </h4>
        <span className="font-mono text-[11px] text-[#788C83]">
          {widget.metric_id ?? 'Series'}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-[12px] text-[#788C83]">No checkpoints returned.</p>
      ) : (
        <div className="mt-3 divide-y divide-[#E8E6E0]">
          {rows.map((row, idx) => {
            const val = Number(row.value ?? 0);
            const widthPct =
              maxVal > 0 && Number.isFinite(val) && val > 0
                ? Math.max(4, Math.round((val / maxVal) * 100))
                : 0;
            return (
              <div
                key={`${String(row.as_of ?? idx)}-${idx}`}
                className="flex items-center gap-3 py-1.5 text-[12px]"
              >
                <span className="w-24 shrink-0 font-mono text-[11px] text-[#525E58]">
                  {String(row.as_of ?? '')}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-[#F3F1EB]">
                  <div
                    className="h-full bg-[#315F52]"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right font-mono tabular-nums text-[#202824]">
                  {row.computable === false
                    ? 'Not computable'
                    : formatWidgetValue(
                        row.value,
                        row.unit as string | null | undefined
                      )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TableWidget({ widget }: { widget: AiViewWidgetSpec }) {
  const rows = widget.rows ?? [];
  const columns =
    rows.length > 0 ? Object.keys(rows[0]).slice(0, 6) : [];

  return (
    <div className="rounded-md border border-[#D9D7D0] bg-white p-4">
      <div className="flex items-baseline justify-between gap-2 border-b border-[#E8E6E0] pb-2.5">
        <h4 className="text-[13px] font-semibold text-[#202824]">
          {widget.title}
        </h4>
        <span className="font-mono text-[11px] text-[#788C83]">
          {widget.entity ?? 'records'} · {rows.length} rows
        </span>
      </div>

      {widget.restricted ? (
        <div className="mt-3 flex items-start gap-2 rounded border border-[#E8E6E0] bg-[#FAF9F6] px-3 py-2 text-[12px] text-[#525E58]">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9B3B32]" aria-hidden="true" />
          <span>{widget.reason || 'Restricted for your assigned role.'}</span>
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-[12px] text-[#788C83]">
          No matching records in this scope.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-[#E8E6E0] font-mono text-[10px] uppercase tracking-wide text-[#788C83]">
                {columns.map((col) => (
                  <th key={col} className="py-1.5 pr-3 font-medium">
                    {col.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E6E0]">
              {rows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {columns.map((col) => {
                    const val = row[col];
                    const isMoney =
                      /value|amount/i.test(col) && typeof val === 'number';
                    return (
                      <td
                        key={col}
                        className={`py-2 pr-3 ${
                          isMoney
                            ? 'font-mono tabular-nums text-[#202824]'
                            : 'text-[#202824]'
                        }`}
                      >
                        {val === null || val === undefined || val === ''
                          ? '—'
                          : isMoney
                            ? `₹${Number(val).toLocaleString('en-IN')}`
                            : String(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AiViewRenderer({
  viewSpec,
  isPreview = false,
  onKeepView,
  onUndoView,
  onClearView,
  onOpenScreen,
  compact = false,
}: AiViewRendererProps) {
  const filterEntries = Object.entries(viewSpec.filters ?? {}).filter(
    ([, v]) => Boolean(v)
  );

  return (
    <section
      aria-label={viewSpec.title || 'My view'}
      className="rounded-md border border-[#315F52]/40 bg-[#FAF9F6] p-4 sm:p-5"
    >
      {isPreview ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded border border-[#315F52]/30 bg-white px-3 py-2 text-[12px]">
          <span className="font-medium text-[#202824]">
            Analyst changed this view
          </span>
          <div className="flex items-center gap-2">
            {onKeepView ? (
              <button
                type="button"
                onClick={onKeepView}
                className="inline-flex h-7 items-center gap-1 rounded bg-[#315F52] px-2.5 text-[11px] font-medium text-white hover:bg-[#264B40]"
              >
                <Check className="h-3 w-3" aria-hidden="true" />
                <span>Keep</span>
              </button>
            ) : null}
            {onUndoView ? (
              <button
                type="button"
                onClick={onUndoView}
                className="inline-flex h-7 items-center gap-1 rounded border border-[#D9D7D0] bg-white px-2.5 text-[11px] font-medium text-[#202824] hover:bg-[#FAF9F6]"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>Undo</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#D9D7D0] pb-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-[#315F52]">
            My view · {formatScreenName(viewSpec.screen)}
          </p>
          <h3 className="mt-0.5 text-[16px] font-semibold text-[#202824]">
            {viewSpec.title || `Custom ${formatScreenName(viewSpec.screen)} view`}
          </h3>
          <p className="mt-1 font-mono text-[11px] text-[#525E58]">
            {viewSpec.edition_id} · {formatRecordClassLabel(viewSpec.record_class)}{' '}
            · As of {viewSpec.as_of}
            {viewSpec.data_version !== undefined && viewSpec.data_version !== null
              ? ` · Data v${String(viewSpec.data_version)}`
              : ''}
            {filterEntries.length > 0
              ? ` · Filters: ${filterEntries.map(([k, v]) => `${k}=${v}`).join(', ')}`
              : ' · Season-wide'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isPreview && onKeepView ? (
            <button
              type="button"
              onClick={onKeepView}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-[#D9D7D0] bg-white px-3 text-[12px] font-medium text-[#202824] transition-colors hover:border-[#315F52] hover:text-[#315F52]"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Keep</span>
            </button>
          ) : null}
          {onOpenScreen ? (
            <button
              type="button"
              onClick={() => onOpenScreen(viewSpec.screen, viewSpec.filters)}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-[#D9D7D0] bg-white px-3 text-[12px] font-medium text-[#202824] transition-colors hover:border-[#315F52] hover:text-[#315F52]"
            >
              <span>Open {formatScreenName(viewSpec.screen)}</span>
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClearView}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-[#D9D7D0] bg-white px-3 text-[12px] font-medium text-[#525E58] transition-colors hover:bg-[#F3F1EB] hover:text-[#202824]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Clear AI view</span>
          </button>
        </div>
      </div>

      {/* Pinned KPI cards */}
      {viewSpec.pinned_metrics && viewSpec.pinned_metrics.length > 0 ? (
        <div
          className={`mt-4 grid gap-3 ${
            compact
              ? 'grid-cols-1'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          }`}
        >
          {viewSpec.pinned_metrics.map((pm) => (
            <div key={pm.metric_id} className="space-y-1">
              <p className="text-[11px] font-medium text-[#525E58]">{pm.label}</p>
              <MetricEvidenceCard metric={pm.result} compact={compact} />
            </div>
          ))}
        </div>
      ) : null}

      {/* Custom widgets */}
      {viewSpec.widgets && viewSpec.widgets.length > 0 ? (
        <div
          className={`mt-4 grid gap-4 ${
            compact || viewSpec.widgets.length === 1
              ? 'grid-cols-1'
              : 'grid-cols-1 lg:grid-cols-2'
          }`}
        >
          {viewSpec.widgets.map((widget) => {
            if (widget.kind === 'metric_by') {
              return <MetricByWidget key={widget.id} widget={widget} />;
            }
            if (widget.kind === 'series') {
              return <SeriesWidget key={widget.id} widget={widget} />;
            }
            return <TableWidget key={widget.id} widget={widget} />;
          })}
        </div>
      ) : null}
    </section>
  );
}
