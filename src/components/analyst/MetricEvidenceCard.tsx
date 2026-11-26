import { ANALYTICS_METRIC_UI_HINTS } from '../../services/analyticsApi';
import {
  formatAnalyticsMetricValue,
  formatAppliedFiltersSummary,
  formatNumeratorDenominator,
} from '../../services/analyticsApi';
import { formatRecordClassLabel } from '../../services/analystApi';
import type { MetricQueryResult } from '../../types/campaigns';

interface MetricEvidenceCardProps {
  metric: MetricQueryResult;
  compact?: boolean;
}

export function MetricEvidenceCard({
  metric,
  compact = false,
}: MetricEvidenceCardProps) {
  const ratio = formatNumeratorDenominator(metric);

  return (
    <div className="rounded-md border border-[var(--color-border)] bg-white p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[12px] font-semibold text-[var(--color-accent)]">
          {ANALYTICS_METRIC_UI_HINTS[metric.metric_id]?.title??'Source metric'}
        </span>
        <span className="font-mono text-[12px] text-[var(--color-ink-subtle)]">
          {formatRecordClassLabel(metric.record_class)}
          {metric.data_version !== undefined && metric.data_version !== null
            ? ` · v${String(metric.data_version)}`
            : ''}
        </span>
      </div>

      {!metric.computable ? (
        <div className="mt-1.5">
          <p className="font-mono text-[14px] font-medium text-[var(--color-ink-muted)]">
            Not computable
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-[var(--color-ink-subtle)]">
            {metric.reason || 'Underlying data is unavailable for this scope.'}
          </p>
        </div>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
          <span
            className={`font-mono font-semibold tabular-nums text-[var(--color-ink)] ${
              compact ? 'text-[17px]' : 'text-[20px]'
            }`}
          >
            {formatAnalyticsMetricValue(metric)}
          </span>
          {ratio ? (
            <span className="font-mono text-[13px] text-[var(--color-ink-muted)] tabular-nums">
              {ratio}
            </span>
          ) : null}
        </div>
      )}

      <details className="mt-2 border-t border-[var(--color-border-subtle)] pt-2 text-[12px] text-[var(--color-ink-subtle)]"><summary>Calculation &amp; source</summary><span>{metric.metric_id}</span>
        <div
          className="truncate"
          title={formatAppliedFiltersSummary(metric.applied_filters)}
        >
          Filters: {formatAppliedFiltersSummary(metric.applied_filters)}
        </div>
        {metric.definition_version !== undefined &&
        metric.definition_version !== null ? (
          <div className="font-mono">
            Definition v{String(metric.definition_version)}
            {metric.unit ? ` · ${metric.unit}` : ''}
          </div>
        ) : null}
      </details>
    </div>
  );
}

