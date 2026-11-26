import { ArrowUpRight } from 'lucide-react';
import {
  ANALYTICS_METRIC_UI_HINTS,
  formatAnalyticsMetricValue,
  formatAppliedFiltersSummary,
  formatNumeratorDenominator,
} from '../../services/analyticsApi';
import type { MetricReferenceRecord } from '../../types/analytics';
import type { MetricQueryResult } from '../../types/campaigns';
import { InfoHint } from '../ui/InfoHint';

interface AnalyticsMetricCardProps {
  metricId: string;
  result: MetricQueryResult | null | undefined;
  definition?: MetricReferenceRecord | null;
  loading?: boolean;
  restricted?: boolean;
  restrictedMessage?: string;
  accentPrimary?: boolean;
  extraNote?: string | null;
  recordClass?: string | null;
  asOfDate?: string | null;
  drillThroughLabel?: string;
  onDrillThrough?: () => void;
}

export function AnalyticsMetricCard({
  metricId,
  result,
  definition,
  loading = false,
  restricted = false,
  restrictedMessage = 'Restricted for your assigned role',
  accentPrimary = false,
  extraNote,
  recordClass,
  asOfDate,
  drillThroughLabel,
  onDrillThrough,
}: AnalyticsMetricCardProps) {
  const hint = ANALYTICS_METRIC_UI_HINTS[metricId];
  const title = hint?.title || definition?.name || metricId;
  const grain = hint?.grain || 'Metric engine';

  const infoContentParts = [
    definition?.business_meaning,
    definition?.formula ? `Formula: ${definition.formula}` : null,
    definition?.inclusion_exclusion
      ? `Scope: ${definition.inclusion_exclusion}`
      : null,
    hint?.caveat,
  ].filter(Boolean);

  const ratioBreakdown = formatNumeratorDenominator(result);

  return (
    <div className="flex flex-col justify-between rounded-xl border border-[var(--color-border)] bg-white p-5">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-[14px] font-semibold text-[var(--color-ink)]">
                {title}
              </h3>
              {infoContentParts.length > 0 ? (
                <InfoHint
                  label={`${title} (${metricId})`}
                  content={infoContentParts.join(' · ')}
                />
              ) : null}
            </div>
            <p className="mt-0.5 text-[12px] text-[var(--color-ink-subtle)]">
              {grain}
              {result?.unit ? ` · ${result.unit}` : ''}
            </p>
          </div>
          <span className="sr-only">
            {metricId}
          </span>
        </div>

        {loading ? (
          <div className="mt-3 h-7 w-28 animate-pulse rounded bg-[var(--color-canvas)]" />
        ) : restricted ? (
          <div className="mt-3">
            <p className="text-[14px] font-medium text-[var(--color-ink-muted)]">Restricted (viewer role)</p>
            <p className="mt-0.5 text-[13px] text-[var(--color-ink-subtle)]">
              {restrictedMessage}
            </p>
          </div>
        ) : !result ? (
          <div className="mt-3">
            <p className="font-mono text-[16px] font-medium text-[var(--color-ink-muted)]">
              Unavailable
            </p>
            <p className="mt-0.5 text-[13px] text-[var(--color-ink-subtle)]">
              No metric result returned.
            </p>
          </div>
        ) : !result.computable ? (
          <div className="mt-3">
            <p className="font-mono text-[15px] font-medium text-[var(--color-ink-muted)]">
              Not computable
            </p>
            <p className="mt-1 text-[13px] leading-snug text-[var(--color-ink-subtle)]">
              {result.reason || 'Required underlying records are not available.'}
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <p
              className={`text-[28px] font-semibold tracking-tight tabular-nums ${
                accentPrimary ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink)]'
              }`}
            >
              {formatAnalyticsMetricValue(result)}
            </p>
            {ratioBreakdown ? (
              <p className="sr-only">
                {ratioBreakdown}
              </p>
            ) : null}
          </div>
        )}

        {extraNote || hint?.caveat ? (
          <p className="mt-2 text-[12px] leading-snug text-[var(--color-ink-muted)]">
            {extraNote || hint?.caveat}
          </p>
        ) : null}
      </div>

      <div className="mt-3 border-t border-[var(--color-border-subtle)] pt-2.5 text-[12px] text-[var(--color-ink-subtle)]">
        <details className="space-y-1"><summary>Calculation &amp; source</summary>
          <div className="truncate font-mono">
            {result?.record_class || recordClass || 'simulated'}
            {result?.as_of || asOfDate ? ` · as of ${result?.as_of || asOfDate}` : ''}
            {result?.data_version !== undefined && result?.data_version !== null
              ? ` · v${String(result.data_version)}`
              : ''}
          </div>
          {result ? (
            <div
              className="truncate"
              title={formatAppliedFiltersSummary(result.applied_filters)}
            >
              Filters: {formatAppliedFiltersSummary(result.applied_filters)}
            </div>
          ) : null}
        </details>

        {drillThroughLabel && onDrillThrough && !restricted ? (
          <button
            type="button"
            onClick={onDrillThrough}
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-accent)] hover:underline"
          >
            <span>{drillThroughLabel}</span>
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

