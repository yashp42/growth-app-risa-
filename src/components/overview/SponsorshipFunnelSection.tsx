import { ArrowRight } from 'lucide-react';
import type {
  ApiErrorInfo,
  CashOutcomeSummary,
  DataLoadStatus,
  FunnelStageRecord,
} from '../../types/overview';
import { DataStateWrapper } from '../ui/DataStateWrapper';
import { InfoHint } from '../ui/InfoHint';
import { SectionHeader } from '../ui/SectionHeader';

interface SponsorshipFunnelSectionProps {
  stages: FunnelStageRecord[];
  cashOutcome: CashOutcomeSummary;
  status: DataLoadStatus;
  error: ApiErrorInfo | null;
  onRetry: () => void;
  selectedStageKey: string | null;
  onSelectStage: (stage: FunnelStageRecord) => void;
  onInspectCashOutcome: () => void;
}

export function SponsorshipFunnelSection({
  stages,
  cashOutcome,
  status,
  error,
  onRetry,
  selectedStageKey,
  onSelectStage,
  onInspectCashOutcome,
}: SponsorshipFunnelSectionProps) {
  const skeleton = (
    <div className="rounded-md border border-[var(--color-border)] bg-white p-5 space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((idx) => (
          <div
            key={idx}
            className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-4"
          >
            <div className="h-3 w-20 rounded bg-[var(--color-border-subtle)]" />
            <div className="mt-3 h-7 w-12 rounded bg-[var(--color-border-subtle)]" />
            <div className="mt-3 h-1.5 w-full rounded bg-[var(--color-border-subtle)]" />
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--color-border-subtle)] pt-4">
        <div className="h-14 w-full rounded bg-[var(--color-surface-subtle)]" />
      </div>
    </div>
  );

  return (
    <section
      id="section-funnel"
      aria-label="Sponsorship growth funnel"
      className="space-y-4"
    >
      <SectionHeader
        title="Sponsorship growth funnel"
        meta={
          cashOutcome.recordClassLabel && cashOutcome.asOfDate
            ? `${cashOutcome.recordClassLabel} · as of ${cashOutcome.asOfDate}`
            : undefined
        }
      />

      <DataStateWrapper
        status={status}
        error={error}
        onRetry={onRetry}
        loadingSkeleton={skeleton}
      >
        <div className="rounded-md border border-[var(--color-border)] bg-white p-5">
          {/* Five count-based pipeline stages */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {stages.map((stage, index) => {
              const isSelected = selectedStageKey === stage.key;
              const isConfirmedStage = stage.key === 'confirmed_partnerships';
              const hasCount = stage.count !== null;

              return (
                <div
                  key={stage.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectStage(stage)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectStage(stage);
                    }
                  }}
                  className={`group relative flex cursor-pointer flex-col justify-between rounded border p-4 text-left transition-colors duration-150 ${
                    isSelected
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]/50'
                      : isConfirmedStage
                        ? 'border-[var(--color-accent)]/50 bg-[var(--color-surface-subtle)] hover:border-[var(--color-accent)]'
                        : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] hover:border-[var(--color-ink-subtle)] hover:bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[12px] text-[var(--color-ink-subtle)] tabular-nums">
                        0{index + 1} · {stage.metricId}
                      </span>
                      {stage.rateFormatted ? (
                        <span className="font-mono text-[12px] text-[var(--color-accent)] tabular-nums">
                          {stage.rateFormatted}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
                      <p className="text-[14px] font-semibold text-[var(--color-ink)]">
                        {stage.label}
                      </p>
                      <span
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <InfoHint
                          label={stage.label}
                          content={stage.description}
                        />
                      </span>
                    </div>

                    <p
                      className={`mt-2 text-[24px] font-semibold tracking-[-0.02em] tabular-nums ${
                        hasCount ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-subtle)]'
                      }`}
                    >
                      {hasCount ? stage.count : stage.reason || '—'}
                    </p>
                  </div>

                  <div className="mt-4">
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-xs bg-[var(--color-border-subtle)]"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full bg-[var(--color-accent)] transition-all duration-150"
                        style={{
                          width:
                            stage.conversionFromPreviousPct !== null
                              ? `${Math.min(100, Math.max(4, stage.conversionFromPreviousPct))}%`
                              : '0%',
                        }}
                      />
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[12px] text-[var(--color-ink-muted)]">
                      <span className="tabular-nums truncate">
                        {stage.cashValueFormatted
                          ? stage.cashValueFormatted
                          : stage.inKindValueFormatted
                            ? stage.inKindValueFormatted
                            : 'Count stage'}
                      </span>
                      <ArrowRight
                        className="h-3 w-3 shrink-0 text-[var(--color-ink-subtle)] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Connected financial outcome: Cash Collected */}
          <div className="mt-5 border-t border-[var(--color-border)] pt-5">
            <div className="flex flex-col gap-4 rounded border border-[var(--color-accent)]/50 bg-[var(--color-surface-subtle)] p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[12px] font-mono text-[var(--color-accent)]">
                  <span>Confirmed Partnerships</span>
                  <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>Financial outcome</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <h3 className="text-[14px] font-semibold text-[var(--color-ink)]">
                    Cash collected &amp; collection rate
                  </h3>
                  <InfoHint
                    label="Cash collection rate definition"
                    content={cashOutcome.definitionNote}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:flex-1 lg:max-w-xl">
                <div className="border-t border-[var(--color-border-subtle)] pt-2 sm:border-t-0 sm:border-l sm:pl-4 sm:pt-0">
                  <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                    Cleared cash collected (M-01)
                  </p>
                  {cashOutcome.collectedCashFormatted ? (
                    <p className="mt-1 text-[20px] font-semibold text-[var(--color-ink)] tabular-nums">
                      {cashOutcome.collectedCashFormatted}
                    </p>
                  ) : (
                    <p className="mt-1 text-[13px] font-medium text-[var(--color-ink-subtle)]">
                      {cashOutcome.collectedReason || 'Not computable'}
                    </p>
                  )}
                </div>

                <div className="border-t border-[var(--color-border-subtle)] pt-2 sm:border-t-0 sm:border-l sm:pl-4 sm:pt-0">
                  <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                    Collection rate (M-06)
                  </p>
                  {cashOutcome.collectionRateFormatted ? (
                    <p className="mt-1 text-[20px] font-semibold text-[var(--color-accent)] tabular-nums">
                      {cashOutcome.collectionRateFormatted}
                    </p>
                  ) : (
                    <p className="mt-1 text-[13px] font-medium text-[var(--color-ink-subtle)]">
                      {cashOutcome.collectionRateReason || 'Not computable'}
                    </p>
                  )}
                  <p className="mt-0.5 text-[12px] text-[var(--color-ink-subtle)] tabular-nums">
                    Signed cash (M-03): {cashOutcome.confirmedCashBasisFormatted ?? '—'}
                  </p>
                </div>

                <div className="border-t border-[var(--color-border-subtle)] pt-2 sm:border-t-0 sm:border-l sm:pl-4 sm:pt-0">
                  <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                    In-kind value (M-04, separate)
                  </p>
                  <p className="mt-1 font-mono text-[15px] font-medium text-[var(--color-ink-muted)] tabular-nums">
                    {cashOutcome.inKindValueSeparateFormatted ?? '—'}
                  </p>
                </div>
              </div>

              <div className="shrink-0">
                <button
                  type="button"
                  onClick={onInspectCashOutcome}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-3 text-[13px] font-medium text-[var(--color-ink)] transition-colors duration-150 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] whitespace-nowrap"
                >
                  Inspect
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </DataStateWrapper>
    </section>
  );
}
