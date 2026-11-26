import {
  BET_SCORECARD_SPEC,
  formatAnalyticsMetricValue,
  formatNumeratorDenominator,
} from '../../services/analyticsApi';
import type {
  AnalyticsPermissionProfile,
  AnalyticsRecordClass,
  ExperimentReferenceRecord,
  ExperimentResultRecord,
  ForecastVersionRecord,
  KpiReferenceRecord,
  MetricReferenceRecord,
  ModelAssumptionRecord,
  ThresholdRuleRecord,
} from '../../types/analytics';
import type { MetricQueryResult } from '../../types/campaigns';
import { EmptyStateNotice } from '../ui/DataStateWrapper';
import { AnalyticsMetricCard } from './AnalyticsMetricCard';

interface StrategyPipelineCapacitySectionProps {
  metrics: Record<string, MetricQueryResult>;
  metricDefsById: Map<string, MetricReferenceRecord>;
  kpiDefsById: Map<string, KpiReferenceRecord>;
  rules: ThresholdRuleRecord[];
  rulesAvailable: boolean;
  assumptions: ModelAssumptionRecord[];
  assumptionsAvailable: boolean;
  experiments: ExperimentReferenceRecord[];
  experimentResults: ExperimentResultRecord[];
  forecasts: ForecastVersionRecord[];
  recordClass: AnalyticsRecordClass;
  asOfDate: string;
  restrictedForbidden: boolean;
  permissionProfile: AnalyticsPermissionProfile;
  loading: boolean;
  onOpenPipeline?: () => void;
}

function bandStyle(severity?: string | null): string {
  if (severity === 'critical') return 'text-[#9B3B32] font-semibold';
  if (severity === 'warning') return 'text-[#B67A2E] font-semibold';
  if (severity === 'ok') return 'text-[var(--color-accent)] font-semibold';
  return 'text-[var(--color-ink-muted)] font-medium';
}

function formatRuleMetricValue(rule: ThresholdRuleRecord): string | null {
  if (!rule.metric_id) return null;
  if (!rule.computable || rule.current_value === null || rule.current_value === undefined) {
    return rule.reason || 'Not computable';
  }
  if (rule.current_unit === 'ratio') {
    return `${(rule.current_value * 100).toFixed(1)}%`;
  }
  if (rule.current_unit === '₹ lakh' || rule.current_unit === 'lakh') {
    return `₹${rule.current_value.toFixed(2)}L`;
  }
  if (rule.current_unit === '₹') {
    return Math.abs(rule.current_value) >= 100000
      ? `₹${(rule.current_value / 100000).toFixed(2)}L`
      : `₹${Math.round(rule.current_value).toLocaleString('en-IN')}`;
  }
  if (rule.current_unit === 'days') {
    return `${rule.current_value.toFixed(1)} d`;
  }
  return Number.isInteger(rule.current_value)
    ? rule.current_value.toLocaleString('en-IN')
    : rule.current_value.toFixed(1);
}

export function StrategyPipelineCapacitySection({
  metrics,
  metricDefsById,
  kpiDefsById,
  rules,
  rulesAvailable,
  assumptions,
  assumptionsAvailable,
  experiments,
  experimentResults,
  forecasts,
  recordClass,
  asOfDate,
  restrictedForbidden,
  permissionProfile,
  loading,
  onOpenPipeline,
}: StrategyPipelineCapacitySectionProps) {
  const getRulesForBetAndMetrics = (
    betId: string,
    metricIds: ReadonlyArray<string>
  ): ThresholdRuleRecord[] => {
    const kpiIds = new Set<string>();
    for (const mId of metricIds) {
      const mDef = metricDefsById.get(mId);
      if (mDef?.kpi_id) kpiIds.add(mDef.kpi_id);
      for (const kpi of kpiDefsById.values()) {
        if (kpi.metric_id === mId) kpiIds.add(kpi.kpi_id);
      }
    }
    return rules.filter(
      (r) =>
        r.bet_id === betId ||
        r.rule_id.startsWith(`EX-${betId}`) ||
        (r.kpi_id && kpiIds.has(r.kpi_id))
    );
  };

  const isRestrictedFinance =
    permissionProfile.isViewerRestricted || restrictedForbidden;
  const m27 = metrics['M-27'];
  const kpiC01 = kpiDefsById.get('K-C-01');
  const capacityRules = rules.filter((r) => r.kpi_id === 'K-C-01');

  return (
    <div className="space-y-8">
      {/* Section E: Strategic Bet Performance */}
      <section aria-labelledby="analytics-bets-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2
              id="analytics-bets-heading"
              className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
            >
              Strategic bet performance (D-010 scorecard &amp; /api/rules)
            </h2>
            <p className="text-[13px] text-[var(--color-ink-muted)]">
              Server-evaluated threshold rules from /api/rules with exact keep, change, escalate, and response bands.
            </p>
          </div>
          <span className="font-mono text-[12px] text-[var(--color-ink-subtle)]">
            {recordClass} · as of {asOfDate}
          </span>
        </div>

        {recordClass === 'historical_synthetic' ? (
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-4 py-2.5 text-[13px] font-medium text-[var(--color-ink-muted)]">
            Reference only: rules apply to the 2026 season
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {BET_SCORECARD_SPEC.map((bet) => {
            const betRules = getRulesForBetAndMetrics(bet.bet_id, bet.metricIds);
            return (
              <div
                key={bet.bet_id}
                className="flex flex-col justify-between rounded-md border border-[var(--color-border)] bg-white p-5"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-semibold text-[var(--color-accent)]">
                          {bet.bet_id}
                        </span>
                        <h3 className="text-[14px] font-semibold text-[var(--color-ink)]">
                          {bet.name}
                        </h3>
                      </div>
                      <p className="mt-0.5 text-[13px] text-[var(--color-ink-subtle)]">
                        Priority {bet.rank} · {bet.strategyNote}
                      </p>
                    </div>
                  </div>

                  {bet.metricIds.length === 0 ? (
                    <div className="rounded border border-dashed border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3.5 py-3 text-[13px] text-[var(--color-ink-muted)]">
                      No standalone metric is mapped to {bet.bet_id} in the
                      metric dictionary; no proxy score is constructed.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {bet.metricIds.map((mId) => {
                        const result = metrics[mId];
                        const def = metricDefsById.get(mId);
                        const kpi = def?.kpi_id
                          ? kpiDefsById.get(def.kpi_id)
                          : undefined;
                        const isRestricted = isRestrictedFinance && mId === 'M-25';
                        const ratio = formatNumeratorDenominator(result);

                        return (
                          <div
                            key={mId}
                            className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[13px] font-medium text-[var(--color-ink)]">
                                {def?.name || mId}
                              </span>
                              <span className="font-mono text-[12px] text-[var(--color-ink-subtle)]">
                                {mId}
                                {def?.kpi_id ? ` · ${def.kpi_id}` : ''}
                              </span>
                            </div>

                            {loading ? (
                              <div className="mt-2 h-6 w-24 animate-pulse rounded bg-[var(--color-border-subtle)]" />
                            ) : isRestricted ? (
                              <p className="mt-1.5 text-[13px] text-[var(--color-ink-muted)]">
                                Restricted (viewer role).
                              </p>
                            ) : !result ? (
                              <p className="mt-1.5 font-mono text-[14px] text-[var(--color-ink-muted)]">
                                Unavailable
                              </p>
                            ) : !result.computable ? (
                              <div className="mt-1.5">
                                <p className="font-mono text-[14px] font-medium text-[var(--color-ink-muted)]">
                                  Not computable
                                </p>
                                <p className="mt-0.5 text-[12px] text-[var(--color-ink-subtle)]">
                                  {result.reason ||
                                    'Underlying season records are not available.'}
                                </p>
                              </div>
                            ) : (
                              <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
                                <span className="font-mono text-[18px] font-semibold tabular-nums text-[var(--color-accent)]">
                                  {formatAnalyticsMetricValue(result)}
                                </span>
                                {ratio ? (
                                  <span className="font-mono text-[13px] text-[var(--color-ink-muted)] tabular-nums">
                                    {ratio}
                                  </span>
                                ) : null}
                              </div>
                            )}

                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-[var(--color-ink-subtle)]">
                              {def?.time_period || kpi?.frequency ? (
                                <span>
                                  Period: {def?.time_period || kpi?.frequency}
                                </span>
                              ) : null}
                              <span className="font-mono">
                                {result?.record_class || recordClass} · as of {result?.as_of || asOfDate}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Server-Evaluated Threshold Rules */}
                <div className="mt-4 border-t border-[var(--color-border-subtle)] pt-3">
                  {!rulesAvailable ? (
                    <p className="text-[12px] text-[var(--color-ink-subtle)]">
                      Operating threshold rules are currently unavailable from /api/rules.
                    </p>
                  ) : betRules.length === 0 ? (
                    <p className="text-[12px] text-[var(--color-ink-subtle)]">
                      No threshold rule row matched for {bet.bet_id}.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {betRules.map((rule) => {
                        const ruleVal = formatRuleMetricValue(rule);
                        return (
                          <div
                            key={rule.rule_id}
                            className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-2.5 text-[12px] text-[var(--color-ink-muted)]"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[var(--color-ink)]">
                              <span>
                                {rule.rule_id} · {rule.kpi_id}
                                {rule.metric_id ? ` (${rule.metric_id})` : ''}
                              </span>
                              <span className={bandStyle(rule.severity)}>
                                {rule.status_label || rule.evaluated_status || rule.rule_status}
                              </span>
                            </div>
                            {ruleVal ? (
                              <p className="mt-1 font-mono text-[var(--color-ink)]">
                                Current ({rule.metric_id}): {ruleVal}
                              </p>
                            ) : null}
                            <p className="mt-1">
                              Evaluate: {rule.evaluate_at}
                              {rule.keep_if ? ` · Keep if ${rule.keep_if}` : ''}
                              {rule.change_if ? ` · Change if ${rule.change_if}` : ''}
                              {` · Escalate if ${rule.escalate_if}`}
                            </p>
                            <p className="mt-0.5 text-[var(--color-ink-subtle)]">
                              Response: {rule.response}
                              {rule.owner_role
                                ? ` · Owner role: ${rule.owner_role}`
                                : ''}
                              {rule.decision_id ? ` · ${rule.decision_id}` : ''}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section F: Pipeline Quality & Deal Economics */}
      <section aria-labelledby="analytics-pipeline-heading" className="space-y-4">
        <div>
          <h2
            id="analytics-pipeline-heading"
            className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
          >
            Pipeline quality and deal economics
          </h2>
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            Open pipeline value reflects proposed face value (never expected
            cash); won deal size includes in-kind unless filtered.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnalyticsMetricCard
            metricId="M-21"
            result={metrics['M-21']}
            definition={metricDefsById.get('M-21') ?? null}
            loading={loading}
            recordClass={recordClass}
            asOfDate={asOfDate}
            drillThroughLabel={
              permissionProfile.canDrillToPipeline
                ? 'Review open deals'
                : undefined
            }
            onDrillThrough={onOpenPipeline}
          />
          <AnalyticsMetricCard
            metricId="M-09"
            result={metrics['M-09']}
            definition={metricDefsById.get('M-09') ?? null}
            loading={loading}
            recordClass={recordClass}
            asOfDate={asOfDate}
            drillThroughLabel={
              permissionProfile.canDrillToPipeline
                ? 'Review confirmed deals'
                : undefined
            }
            onDrillThrough={onOpenPipeline}
          />
          <AnalyticsMetricCard
            metricId="M-13"
            result={metrics['M-13']}
            definition={metricDefsById.get('M-13') ?? null}
            loading={loading}
            recordClass={recordClass}
            asOfDate={asOfDate}
            drillThroughLabel={
              permissionProfile.canDrillToPipeline
                ? 'Inspect proposals'
                : undefined
            }
            onDrillThrough={onOpenPipeline}
          />
          <AnalyticsMetricCard
            metricId="M-15"
            result={metrics['M-15']}
            definition={metricDefsById.get('M-15') ?? null}
            loading={loading}
            recordClass={recordClass}
            asOfDate={asOfDate}
          />
          <AnalyticsMetricCard
            metricId="M-16"
            result={metrics['M-16']}
            definition={metricDefsById.get('M-16') ?? null}
            loading={loading}
            recordClass={recordClass}
            asOfDate={asOfDate}
          />
          <AnalyticsMetricCard
            metricId="M-20"
            result={metrics['M-20']}
            definition={metricDefsById.get('M-20') ?? null}
            loading={loading}
            recordClass={recordClass}
            asOfDate={asOfDate}
          />
        </div>
      </section>

      {/* Section G: Capacity & Operational Efficiency */}
      <section aria-labelledby="analytics-capacity-heading" className="space-y-4">
        <div>
          <h2
            id="analytics-capacity-heading"
            className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
          >
            Capacity and operational efficiency
          </h2>
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            Logged task hours compared against model task hours (M-27). No cash
            budget, spend cap, or monetary labour cost is modeled.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <AnalyticsMetricCard
              metricId="M-27"
              result={m27}
              definition={metricDefsById.get('M-27') ?? null}
              loading={loading}
              recordClass={recordClass}
              asOfDate={asOfDate}
              restricted={isRestrictedFinance}
              restrictedMessage="Hours and staffing metrics are restricted for Viewer accounts."
            />
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-white p-5 lg:col-span-7">
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-3">
              <h3 className="text-[14px] font-semibold text-[var(--color-ink)]">
                Capacity governance and thresholds
              </h3>
              <span className="font-mono text-[12px] text-[var(--color-ink-subtle)]">
                K-C-01
              </span>
            </div>

            <div className="mt-3 space-y-2.5 text-[13px] text-[var(--color-ink-muted)]">
              {kpiC01 ? (
                <p>
                  <strong className="font-medium text-[var(--color-ink)]">
                    {kpiC01.name}:
                  </strong>{' '}
                  {kpiC01.definition}
                  {kpiC01.grain ? ` (${kpiC01.grain})` : ''}
                </p>
              ) : null}

              {capacityRules.length > 0 ? (
                capacityRules.map((r) => (
                  <div
                    key={r.rule_id}
                    className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3"
                  >
                    <div className="flex items-center justify-between font-mono text-[12px] text-[var(--color-ink)]">
                      <span>{r.rule_id}</span>
                      <span className={bandStyle(r.severity)}>
                        {r.status_label || r.evaluated_status || r.rule_status}
                      </span>
                    </div>
                    <p className="mt-1">
                      Evaluate: {r.evaluate_at} · Escalate if {r.escalate_if} ·{' '}
                      {r.response}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-[var(--color-ink-subtle)]">
                  {rulesAvailable
                    ? 'No K-C-01 threshold rule row returned.'
                    : 'Threshold rules are unavailable from /api/rules.'}
                </p>
              )}

              <p className="text-[var(--color-ink-subtle)]">
                Hours logs are personal execution data restricted by role. When
                hours logs are absent (including the 2025 synthetic dataset),
                M-27 reports not computable rather than estimating capacity.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Governance Panels: Experiment Register, Forecasts & Model Assumptions */}
      <section aria-labelledby="analytics-governance-heading" className="space-y-4">
        <h2
          id="analytics-governance-heading"
          className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
        >
          Experiments, forecasting scope, and model assumptions
        </h2>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-[var(--color-border)] bg-white p-5">
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-3">
              <h3 className="text-[14px] font-semibold text-[var(--color-ink)]">
                Experiment register (read-only)
              </h3>
              <span className="font-mono text-[12px] text-[var(--color-ink-subtle)]">
                /api/reference/experiments
              </span>
            </div>

            {experiments.length === 0 ? (
              <div className="mt-4">
                <EmptyStateNotice
                  title="No experiment register records returned"
                  description="Experiment records appear here when available from /api/reference/experiments."
                />
              </div>
            ) : (
              <div className="mt-3 space-y-3 text-[13px]">
                {experiments.map((exp) => {
                  const res = experimentResults.find(
                    (r) => r.experiment_id === exp.experiment_id
                  );
                  return (
                    <div
                      key={exp.experiment_id}
                      className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3"
                    >
                      <div className="flex items-center justify-between font-mono text-[12px] text-[var(--color-ink)]">
                        <span>
                          {exp.experiment_id} · {exp.bet_id}
                        </span>
                        <span className="capitalize text-[var(--color-accent)]">
                          {exp.status}
                        </span>
                      </div>
                      <p className="mt-1 font-medium text-[var(--color-ink)]">
                        {exp.hypothesis}
                      </p>
                      <p className="mt-0.5 text-[var(--color-ink-muted)]">
                        {[
                          exp.primary_kpi_id ? `KPI: ${exp.primary_kpi_id}` : null,
                          exp.rule_id ? `Rule: ${exp.rule_id}` : null,
                          exp.time_limit ? `Limit: ${exp.time_limit}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {res ? (
                        <p className="mt-1 font-mono text-[12px] text-[var(--color-accent)]">
                          Decision: {res.decision} (n = {res.n})
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-white p-5">
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-3">
              <h3 className="text-[14px] font-semibold text-[var(--color-ink)]">
                In-season re-forecasting
              </h3>
              <span className="font-mono text-[12px] text-[var(--color-ink-subtle)]">
                Out of scope
              </span>
            </div>

            {forecasts.length > 0 ? (
              <div className="mt-3 space-y-2 text-[13px]">
                {forecasts.map((fc) => (
                  <div
                    key={fc.forecast_id}
                    className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3"
                  >
                    <div className="flex items-center justify-between font-mono text-[12px] text-[var(--color-ink)]">
                      <span>
                        {fc.forecast_id} · {fc.model_version}
                      </span>
                      <span className="capitalize">{fc.status}</span>
                    </div>
                    <p className="mt-1 text-[var(--color-ink-muted)]">
                      Baseline: {fc.baseline_scenario_id} · Expected cash:{' '}
                      {fc.expected_cash !== null &&
                      fc.expected_cash !== undefined
                        ? `₹${fc.expected_cash.toFixed(2)}L`
                        : '—'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4">
                <EmptyStateNotice
                  title="In-season re-forecasting is not active in this release"
                  description="Frozen model re-forecasts require an approved offline forecasting job and human publication review. Approved D-009 scenario benchmarks remain read-only."
                />
              </div>
            )}
          </div>
        </div>

        {/* Model Assumptions */}
        <div className="rounded-md border border-[var(--color-border)] bg-white p-5">
          <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-3">
            <h3 className="text-[14px] font-semibold text-[var(--color-ink)]">
              Frozen model assumptions (read-only)
            </h3>
            <span className="font-mono text-[12px] text-[var(--color-ink-subtle)]">
              /api/reference/assumptions
            </span>
          </div>

          {!assumptionsAvailable || assumptions.length === 0 ? (
            <div className="mt-4">
              <EmptyStateNotice
                title="Model assumptions are unavailable from the reference service"
                description="Frozen assumption entries appear here when returned by the reference service."
              />
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-[var(--color-ink-muted)]">
                    <th className="px-3 py-2 font-medium">ID</th>
                    <th className="px-3 py-2 font-medium">Variable</th>
                    <th className="px-3 py-2 font-medium">Frozen value</th>
                    <th className="px-3 py-2 font-medium">Validation KPI</th>
                    <th className="px-3 py-2 font-medium">Uncertainty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {assumptions.map((a) => (
                    <tr key={a.assumption_id}>
                      <td className="px-3 py-2 font-mono font-medium text-[var(--color-ink)]">
                        {a.assumption_id}
                      </td>
                      <td className="px-3 py-2 text-[var(--color-ink)]">{a.variable}</td>
                      <td className="px-3 py-2 font-mono text-[var(--color-ink-muted)]">
                        {a.frozen_value}
                      </td>
                      <td className="px-3 py-2 font-mono text-[var(--color-ink-muted)]">
                        {a.validation_kpi_id || '—'}
                      </td>
                      <td className="px-3 py-2 text-[var(--color-ink-subtle)]">
                        {a.uncertainty || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
