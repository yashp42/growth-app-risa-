import { AlertCircle } from 'lucide-react';
import {
  formatAnalyticsMetricValue,
  formatAppliedFiltersSummary,
  formatNumeratorDenominator,
} from '../../services/analyticsApi';
import type {
  AnalyticsPermissionProfile,
  AnalyticsRecordClass,
  CashCollectionGateSnapshot,
  GateWeeklyPacingRow,
  MetricReferenceRecord,
  ScenarioReferenceRecord,
  WeeklyPacingPoint,
} from '../../types/analytics';
import type { MetricQueryResult } from '../../types/campaigns';
import { EmptyStateNotice } from '../ui/DataStateWrapper';
import { AnalyticsMetricCard } from './AnalyticsMetricCard';

interface PerformancePacingSectionProps {
  metrics: Record<string, MetricQueryResult>;
  m30ByScenario: Record<string, MetricQueryResult>;
  metricDefsById: Map<string, MetricReferenceRecord>;
  approvedScenarios: ScenarioReferenceRecord[];
  selectedScenarioId: string | null;
  onSelectScenario: (scenarioId: string) => void;
  weeklyPacing: WeeklyPacingPoint[];
  latestPassedGateWeek: GateWeeklyPacingRow | null;
  cashGate: CashCollectionGateSnapshot | null;
  weeklyPacingUnavailable: boolean;
  scenariosAvailable: boolean;
  gatesAvailable: boolean;
  recordClass: AnalyticsRecordClass;
  asOfDate: string;
  restrictedForbidden: boolean;
  permissionProfile: AnalyticsPermissionProfile;
  loading: boolean;
}

const PERFORMANCE_METRIC_ORDER: ReadonlyArray<{
  id: string;
  accent?: boolean;
}> = [
  { id: 'M-01', accent: true },
  { id: 'M-02' },
  { id: 'M-03' },
  { id: 'M-04' },
  { id: 'M-06' },
  { id: 'M-07' },
];

export function PerformancePacingSection({
  metrics,
  m30ByScenario,
  metricDefsById,
  approvedScenarios,
  selectedScenarioId,
  onSelectScenario,
  weeklyPacing,
  latestPassedGateWeek,
  cashGate,
  weeklyPacingUnavailable,
  scenariosAvailable,
  gatesAvailable,
  recordClass,
  asOfDate,
  restrictedForbidden,
  permissionProfile,
  loading,
}: PerformancePacingSectionProps) {
  const m06 = metrics['M-06'];
  const m24 = metrics['M-24'];
  const isCashViewerRestricted =
    permissionProfile.isViewerRestricted || restrictedForbidden;

  const selectedScenario =
    approvedScenarios.find((s) => s.scenario_id === selectedScenarioId) ??
    approvedScenarios[0] ??
    null;

  const chartPoints = weeklyPacing.map((wp) => {
    const actualVal =
      wp.passed && wp.metric && wp.metric.computable && wp.metric.value !== null
        ? wp.metric.value
        : null;
    return {
      week: wp.week,
      actualVal,
      baseVal: wp.baseTarget,
      planVal: wp.planTarget,
    };
  });

  const numericChartValues = chartPoints
    .flatMap((p) => [p.actualVal, p.baseVal, p.planVal])
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const hasChartSeries = numericChartValues.length > 0;
  const maxVal = hasChartSeries ? Math.max(...numericChartValues, 1) : 1;

  const width = 620;
  const height = 185;
  const padX = 48;
  const padY = 22;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const xForIdx = (idx: number) =>
    padX + (idx / Math.max(chartPoints.length - 1, 1)) * plotW;
  const yForVal = (val: number) => padY + plotH - (val / maxVal) * plotH;

  const buildPath = (extractor: (p: (typeof chartPoints)[number]) => number | null) =>
    chartPoints
      .map((p, idx) => {
        const val = extractor(p);
        if (val === null) return null;
        const prevNull = idx === 0 || extractor(chartPoints[idx - 1]) === null;
        return `${prevNull ? 'M' : 'L'} ${xForIdx(idx).toFixed(1)} ${yForVal(val).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(' ');

  const actualPath = buildPath((p) => p.actualVal);
  const basePath = buildPath((p) => p.baseVal);
  const planPath = buildPath((p) => p.planVal);

  return (
    <div className="space-y-8">
      {/* Section A: Performance Overview */}
      <section aria-labelledby="analytics-perf-heading" className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h2
              id="analytics-perf-heading"
              className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
            >
              Performance overview
            </h2>
            <p className="text-[13px] text-[var(--color-ink-muted)]">
              Confirmed commitments (total, cash-type, in-kind) separated from
              reconciled cash collected and remaining cash obligations.
            </p>
          </div>
          <span className="font-mono text-[12px] text-[var(--color-ink-subtle)]">
            {recordClass} · as of {asOfDate}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PERFORMANCE_METRIC_ORDER.map(({ id, accent }) => {
            const isCashRestricted =
              isCashViewerRestricted &&
              (id === 'M-01' || id === 'M-06' || id === 'M-07');
            return (
              <AnalyticsMetricCard
                key={id}
                metricId={id}
                result={metrics[id]}
                definition={metricDefsById.get(id) ?? null}
                loading={loading}
                restricted={isCashRestricted}
                recordClass={recordClass}
                asOfDate={asOfDate}
                accentPrimary={accent}
              />
            );
          })}
        </div>
      </section>

      {/* Section B: Growth Pacing & Target Performance */}
      <section aria-labelledby="analytics-pacing-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2
              id="analytics-pacing-heading"
              className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
            >
              Growth pacing and target performance
            </h2>
            <p className="text-[13px] text-[var(--color-ink-muted)]">
              Weekly signed value against Base and Plan targets. Pre-event cash collection is tracked separately.
            </p>
          </div>

          {latestPassedGateWeek ? (
            <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1.5 text-right font-mono text-[12px]">
              <span className="text-[var(--color-ink-subtle)]">
                Latest checkpoint ({latestPassedGateWeek.period} ·{' '}
                {latestPassedGateWeek.week_end}):{' '}
              </span>
              <span className="font-semibold text-[var(--color-ink)]">
                {latestPassedGateWeek.status}
              </span>
            </div>
          ) : null}
        </div>

        {approvedScenarios.length > 0 ? (
          <div
            role="group"
            aria-label="Approved scenario comparison"
            className="inline-flex rounded-md border border-[var(--color-border)] bg-white p-0.5"
          >
            {approvedScenarios.map((sc) => {
              const active = selectedScenario?.scenario_id === sc.scenario_id;
              return (
                <button
                  key={sc.scenario_id}
                  type="button"
                  onClick={() => onSelectScenario(sc.scenario_id)}
                  className={`rounded px-3 py-1 text-[13px] font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {sc.scenario_id} {sc.name}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* W1-W10 Signed Value Pacing + Separate T-7 Cash Gate */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="rounded-md border border-[var(--color-border)] bg-white p-5 lg:col-span-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-border-subtle)] pb-3">
              <div>
                <h3 className="text-[14px] font-semibold text-[var(--color-ink)]">
                  Cumulative signed value
                </h3>
                <p className="text-[13px] text-[var(--color-ink-subtle)]">
                  Actual signed value against Base and Plan targets · {recordClass} · as of {asOfDate}
                </p>
              </div>
              <div className="flex items-center gap-3 font-mono text-[12px] text-[var(--color-ink-muted)]">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-3 bg-[var(--color-accent)]" /> Actual signed value
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-0.5 w-3 border-t-2 border-dashed border-[var(--color-ink-subtle)]" /> Base
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-0.5 w-3 border-t-2 border-dotted border-[#B67A2E]" /> Plan
                </span>
              </div>
            </div>

            {weeklyPacingUnavailable && !gatesAvailable ? (
              <div className="mt-4">
                <EmptyStateNotice
                  title="Weekly pacing data and target gates are unavailable"
                  description="Pacing information could not be loaded. Try refreshing the page."
                />
              </div>
            ) : (
              <>
                {hasChartSeries ? (
                  <div className="mt-4 overflow-x-auto">
                    <svg
                      viewBox={`0 0 ${width} ${height}`}
                      className="h-48 w-full min-w-[460px]"
                      role="img"
                      aria-label="Weekly signed value against Base and Plan targets"
                    >
                      {[0, 0.5, 1].map((ratio) => {
                        const y = padY + plotH - ratio * plotH;
                        const labelVal = maxVal * ratio;
                        return (
                          <g key={ratio}>
                            <line
                              x1={padX}
                              x2={width - padX}
                              y1={y}
                              y2={y}
                              stroke="var(--color-border-subtle)"
                              strokeDasharray="3 3"
                            />
                            <text
                              x={padX - 6}
                              y={y + 4}
                              textAnchor="end"
                              className="fill-[var(--color-ink-subtle)] font-mono text-[12px]"
                            >
                              {labelVal >= 100000
                                ? `₹${(labelVal / 100000).toFixed(0)}L`
                                : `₹${Math.round(labelVal)}`}
                            </text>
                          </g>
                        );
                      })}

                      {basePath ? (
                        <path
                          d={basePath}
                          fill="none"
                          stroke="var(--color-ink-subtle)"
                          strokeWidth="2"
                          strokeDasharray="4 4"
                        />
                      ) : null}

                      {planPath ? (
                        <path
                          d={planPath}
                          fill="none"
                          stroke="#B67A2E"
                          strokeWidth="2"
                          strokeDasharray="2 3"
                        />
                      ) : null}

                      {actualPath ? (
                        <path
                          d={actualPath}
                          fill="none"
                          stroke="var(--color-accent)"
                          strokeWidth="2.5"
                        />
                      ) : null}

                      {chartPoints.map((p, idx) => (
                        <g key={p.week}>
                          {p.baseVal !== null ? (
                            <circle
                              cx={xForIdx(idx)}
                              cy={yForVal(p.baseVal)}
                              r="3"
                              fill="#FFFFFF"
                              stroke="var(--color-ink-subtle)"
                              strokeWidth="1.5"
                            />
                          ) : null}
                          {p.planVal !== null ? (
                            <circle
                              cx={xForIdx(idx)}
                              cy={yForVal(p.planVal)}
                              r="3"
                              fill="#FFFFFF"
                              stroke="#B67A2E"
                              strokeWidth="1.5"
                            />
                          ) : null}
                          {p.actualVal !== null ? (
                            <circle
                              cx={xForIdx(idx)}
                              cy={yForVal(p.actualVal)}
                              r="4"
                              fill="var(--color-accent)"
                            />
                          ) : null}
                          <text
                            x={xForIdx(idx)}
                            y={height - 4}
                            textAnchor="middle"
                            className="fill-[var(--color-ink-muted)] font-mono text-[12px]"
                          >
                            {p.week}
                          </text>
                        </g>
                      ))}
                    </svg>
                  </div>
                ) : (
                  <div className="mt-4 flex items-center gap-2 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3.5 py-2.5 text-[13px] text-[var(--color-ink-muted)]">
                    <AlertCircle className="h-4 w-4 shrink-0 text-[var(--color-ink-subtle)]" />
                    <span>
                      No weekly signed-value targets are available for
                      the selected context.
                    </span>
                  </div>
                )}

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-[var(--color-ink-muted)]">
                        <th className="px-3 py-2 font-medium">Week</th>
                        <th className="px-3 py-2 font-medium">Week end</th>
                        <th className="px-3 py-2 text-right font-medium">
                          Actual signed
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Base target
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Plan target
                        </th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border-subtle)]">
                      {weeklyPacing.map((row) => {
                        const m = row.metric;
                        return (
                          <tr key={row.week}>
                            <td className="px-3 py-2 font-mono font-medium text-[var(--color-ink)]">
                              {row.week}
                            </td>
                            <td className="px-3 py-2 font-mono text-[var(--color-ink-subtle)]">
                              {row.weekEnd ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--color-ink)]">
                              {!row.passed
                                ? 'Upcoming'
                                : m
                                  ? m.computable
                                    ? formatAnalyticsMetricValue(m)
                                    : m.reason || 'Not computable'
                                  : 'Unavailable'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--color-ink-muted)]">
                              {row.baseTarget !== null
                                ? `₹${(row.baseTarget / 100000).toFixed(2)}L`
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--color-ink-muted)]">
                              {row.planTarget !== null
                                ? `₹${(row.planTarget / 100000).toFixed(2)}L`
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-[var(--color-ink-muted)]">
                              {row.passed
                                ? row.serverStatus || '—'
                                : 'Upcoming checkpoint'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Right column: Separate T-7 Cash Gate + M-24 */}
          <div className="space-y-4 lg:col-span-4">
            <div className="rounded-md border border-[var(--color-border)] bg-white p-5">
              <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-3">
                <h3 className="text-[14px] font-semibold text-[var(--color-ink)]">
                  Pre-event collection target
                </h3>

              </div>

              {isCashViewerRestricted ? (
                <p className="mt-3 text-[13px] text-[var(--color-ink-muted)]">
                  Restricted (viewer role): cash collection metrics are not available.
                </p>
              ) : (
                <div className="mt-3 space-y-2.5 text-[14px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[var(--color-ink-muted)]">Collection rate</span>
                    <span className="font-mono text-[18px] font-semibold tabular-nums text-[var(--color-accent)]">
                      {formatAnalyticsMetricValue(m06, 'ratio')}
                    </span>
                  </div>
                  {m06 && !m06.computable ? (
                    <p className="text-[13px] text-[var(--color-ink-subtle)]">
                      {m06.reason || 'Cash collection ratio is not computable.'}
                    </p>
                  ) : null}
                  {formatNumeratorDenominator(m06) ? (
                    <details className="source-details"><summary>Calculation</summary>{formatNumeratorDenominator(m06)}</details>
                  ) : null}

                  <div className="border-t border-[var(--color-border-subtle)] pt-2.5 text-[13px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--color-ink-muted)]">Collection target</span>
                      <span className="font-mono font-medium text-[var(--color-ink)]">
                        {cashGate
                          ? `≥ ${(cashGate.threshold * 100).toFixed(0)}%`
                          : '≥ 85%'}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-[var(--color-ink-muted)]">Status</span>
                      <span className="font-medium text-[var(--color-ink)]">
                        {cashGate
                          ? cashGate.is_due === false || cashGate.computable
                            ? cashGate.status
                            : cashGate.reason || cashGate.status
                          : 'Unavailable'}
                      </span>
                    </div>
                    <div className="mt-2 font-mono text-[12px] text-[var(--color-ink-subtle)]">
                      {recordClass} · as of {asOfDate}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <AnalyticsMetricCard
              metricId="M-24"
              result={m24}
              definition={metricDefsById.get('M-24') ?? null}
              loading={loading}
              recordClass={recordClass}
              asOfDate={asOfDate}
              extraNote="Ever confirmed by the date, including later withdrawals. Compared against the latest dated target effective on or before the as-of date."
            />
          </div>
        </div>

        {/* Read-Only Approved Scenario Lookup (M-30 & SC-01..SC-03/APPROVED) */}
        <div className="rounded-md border border-[var(--color-border)] bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-border-subtle)] pb-3">
            <div>
              <h3 className="text-[14px] font-semibold text-[var(--color-ink)]">
                Approved cash scenarios
              </h3>
              <p className="text-[13px] text-[var(--color-ink-subtle)]">
                Expected pre-event cash collection, in ₹ lakh. In-kind support is excluded.
              </p>
            </div>
            <div className="font-mono text-[12px] text-[var(--color-ink-subtle)]">
              {recordClass} · as of {asOfDate}
            </div>
          </div>

          {!scenariosAvailable || approvedScenarios.length === 0 ? (
            <div className="mt-4">
              <EmptyStateNotice
                title="Approved scenario rows are currently unavailable"
                description="Scenario forecasts could not be loaded. Try refreshing this page."
              />
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-[var(--color-ink-muted)]">
                    <th className="px-3 py-2 font-medium">Scenario</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Expected cash
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Current forecast
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Forecast range
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Person-weeks
                    </th>
                    <th className="px-3 py-2 font-medium">Source details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {approvedScenarios.map((sc) => {
                    const m30Row = m30ByScenario[sc.scenario_id];
                    return (
                      <tr key={sc.scenario_id}>
                        <td className="px-3 py-2.5">

                          <span className="font-medium text-[var(--color-ink)]">
                            · {sc.name}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[var(--color-accent)]">
                          {sc.status}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-[var(--color-ink)]">
                          ₹{sc.expected_cash.toFixed(2)}L
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--color-accent)]">
                          {m30Row
                            ? m30Row.computable
                              ? formatAnalyticsMetricValue(m30Row)
                              : m30Row.reason || 'Not computable'
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--color-ink-muted)]">
                          {sc.p10 !== null &&
                          sc.p10 !== undefined &&
                          sc.p90 !== null &&
                          sc.p90 !== undefined
                            ? `₹${sc.p10.toFixed(1)}L – ₹${sc.p90.toFixed(1)}L`
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--color-ink-muted)]">
                          {sc.window_pw !== null && sc.window_pw !== undefined
                            ? `${sc.window_pw}w + ${sc.preseason_pw ?? 0}p`
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[12px] text-[var(--color-ink-subtle)]">
                          <details><summary>Source</summary>{[sc.scenario_id, sc.decision_id, sc.output_checksum].filter(Boolean).join(' · ') || '—'}</details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

