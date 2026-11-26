import type {
  ApiErrorInfo,
  DataLoadStatus,
  GrowthPulseMetric,
} from '../../types/overview';
import { DataStateWrapper } from '../ui/DataStateWrapper';
import { InfoHint } from '../ui/InfoHint';
import { SectionHeader } from '../ui/SectionHeader';

interface GrowthPulseSectionProps {
  metrics: GrowthPulseMetric[];
  status: DataLoadStatus;
  error: ApiErrorInfo | null;
  onRetry: () => void;
  onInspectMetric?: (metric: GrowthPulseMetric) => void;
  recordClass?: string;
  asOfDate?: string;
}

export function GrowthPulseSection({
  metrics,
  status,
  error,
  onRetry,
  onInspectMetric,
  recordClass,
  asOfDate,
}: GrowthPulseSectionProps) {
  const skeleton = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((idx) => (
        <div
          key={idx}
          className="rounded-md border border-[var(--color-border)] bg-white p-5"
        >
          <div className="h-3.5 w-28 rounded bg-[var(--color-border-subtle)]" />
          <div className="mt-4 h-8 w-24 rounded bg-[var(--color-border-subtle)]" />
          <div className="mt-3 h-3 w-20 rounded bg-[var(--color-canvas)]" />
        </div>
      ))}
    </div>
  );

  return (
    <section id="section-pulse" aria-label="Growth pulse" className="space-y-4">
      <SectionHeader
        title="Season performance"
        meta={
          recordClass && asOfDate ? `${recordClass} · as of ${asOfDate}` : undefined
        }
      />

      <DataStateWrapper
        status={status}
        error={error}
        onRetry={onRetry}
        loadingSkeleton={skeleton}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => {
            const isNorthStar = Boolean(metric.isNorthStar);
            const hasValue = metric.computable && metric.formattedValue !== null;

            return (
              <div
                key={metric.id}
                onClick={() => onInspectMetric?.(metric)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onInspectMetric?.(metric);
                  }
                }}
                role="button"
                tabIndex={0}
                className={`flex cursor-pointer flex-col justify-between rounded-xl border p-6 text-left transition-colors duration-150 ${
                  isNorthStar
                    ? 'metric-hero border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]'
                    : 'border-[var(--color-border)] bg-white hover:border-[var(--color-ink-subtle)] hover:bg-[var(--color-surface-subtle)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-[14px] font-medium text-[var(--color-ink-muted)]">
                    <span>{metric.label}</span>
                    <InfoHint
                      label={`Definition for ${metric.label}`}
                      content={metric.supportingLabel}
                    />
                  </span>
                  <span className="font-mono text-[12px] font-medium text-[var(--color-ink-subtle)] whitespace-nowrap">
                    {isNorthStar ? 'Primary measure' : ''}
                  </span>
                </div>

                <div className="mt-3 flex items-baseline justify-between gap-2">
                  {hasValue ? (
                    <span className="metric-value text-[32px] font-semibold tracking-[-0.02em] text-[var(--color-ink)] tabular-nums">
                      {metric.formattedValue}
                    </span>
                  ) : (
                    <span className="text-[14px] font-medium text-[var(--color-ink-subtle)]">
                      {metric.reason || 'Not computable'}
                    </span>
                  )}
                  {metric.comparisonText && hasValue ? (
                    <span className="font-mono text-[13px] text-[var(--color-ink-muted)] tabular-nums">
                      {metric.comparisonText}
                    </span>
                  ) : null}
                </div>

                <div className="mt-2.5 flex flex-col gap-0.5">
                  {metric.secondaryBreakdownLabel ? (
                    <p className="text-[12px] text-[var(--color-ink-subtle)]">
                      {metric.secondaryBreakdownLabel}
                    </p>
                  ) : null}
                  {metric.recordClassLabel && metric.asOfDate ? (
                    <span className="sr-only">{metric.recordClassLabel} · as of {metric.asOfDate}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </DataStateWrapper>
    </section>
  );
}

