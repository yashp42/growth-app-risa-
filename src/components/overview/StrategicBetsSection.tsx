import type {
  ApiErrorInfo,
  DataLoadStatus,
  StrategicBetSlot,
} from '../../types/overview';
import { DataStateWrapper } from '../ui/DataStateWrapper';
import { SectionHeader } from '../ui/SectionHeader';

interface StrategicBetsSectionProps {
  bets: StrategicBetSlot[];
  status: DataLoadStatus;
  error: ApiErrorInfo | null;
  onRetry: () => void;
  recordClass?: string;
  asOfDate?: string;
}

export function StrategicBetsSection({
  bets,
  status,
  error,
  onRetry,
  recordClass,
  asOfDate,
}: StrategicBetsSectionProps) {
  const skeleton = (
    <div className="divide-y divide-[var(--color-border-subtle)] rounded-md border border-[var(--color-border)] bg-white">
      {[0, 1, 2, 3, 4].map((idx) => (
        <div
          key={idx}
          className="flex items-center justify-between gap-4 px-5 py-3.5"
        >
          <div className="h-3.5 w-48 rounded bg-[var(--color-border-subtle)]" />
          <div className="h-2 w-32 rounded bg-[var(--color-canvas)]" />
          <div className="h-3.5 w-16 rounded bg-[var(--color-border-subtle)]" />
        </div>
      ))}
    </div>
  );

  return (
    <section
      id="section-bets"
      aria-label="Strategic bets"
      className="space-y-4"
    >
      <SectionHeader
        title="Strategic bets &amp; rules"
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
        <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-white">
          {recordClass === 'historical_synthetic' ? (
            <div className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-5 py-2.5 text-[13px] font-medium text-[var(--color-ink-muted)]">
              Reference only: rules apply to the 2026 season
            </div>
          ) : null}
          <ul className="divide-y divide-[var(--color-border-subtle)]">
            {bets.map((bet) => {
              const hasProgress = bet.progressPct !== null;
              const statusTone =
                bet.band === 'keep'
                  ? 'text-[var(--color-accent)]'
                  : bet.band === 'escalate' || bet.band === 'stop'
                    ? 'text-[#9B3B32]'
                    : 'text-[var(--color-ink-muted)]';

              return (
                <li
                  key={bet.id}
                  className="grid grid-cols-1 items-center gap-3 px-5 py-3.5 sm:grid-cols-12"
                >
                  <div className="flex items-baseline gap-3 sm:col-span-5">
                    <span className="font-mono text-[12px] font-medium text-[var(--color-ink-subtle)] shrink-0">
                      {bet.indexLabel}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-[var(--color-ink)]">
                        {bet.title}
                      </p>
                      {bet.metricSummary ? (
                        <p className="truncate text-[13px] text-[var(--color-ink-subtle)]">
                          {bet.metricSummary}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:col-span-4">
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-xs bg-[var(--color-border-subtle)]"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full bg-[var(--color-accent)]"
                        style={{
                          width: hasProgress
                            ? `${Math.min(100, Math.max(0, bet.progressPct ?? 0))}%`
                            : '0%',
                        }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-[13px] text-[var(--color-ink-muted)] tabular-nums">
                      {hasProgress ? `${bet.progressPct}%` : '—'}
                    </span>
                  </div>

                  <div className="sm:col-span-3 sm:text-right">
                    <span className={`font-mono text-[12px] font-medium ${statusTone}`}>
                      {bet.thresholdStatus ?? '—'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </DataStateWrapper>
    </section>
  );
}
