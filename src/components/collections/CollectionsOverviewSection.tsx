import { Info } from 'lucide-react';
import {
  COLLECTIONS_METRIC_DICTIONARY,
  formatCollectionsMetricValue,
} from '../../services/collectionsApi';
import type {
  CollectionsPermissionProfile,
  CollectionsRecordClass,
  CollectionsSummaryState,
} from '../../types/collections';
import { InfoHint } from '../ui/InfoHint';

interface CollectionsOverviewSectionProps {
  summary: CollectionsSummaryState;
  recordClass: CollectionsRecordClass;
  editionId: string;
  permissionProfile: CollectionsPermissionProfile;
  loading: boolean;
}

export function CollectionsOverviewSection({
  summary,
  recordClass,
  editionId,
  permissionProfile,
  loading,
}: CollectionsOverviewSectionProps) {
  const isHistorical = recordClass === 'historical_synthetic';
  const m01 = summary.metrics['M-01'];
  const m03 = summary.metrics['M-03'];
  const m06 = summary.metrics['M-06'];
  const m07 = summary.metrics['M-07'];
  const m02 = summary.metrics['M-02'];
  const m04 = summary.metrics['M-04'];

  const gate = summary.cashGate;
  const gateThresholdLabel = gate
    ? gate.threshold_label ||
      (gate.threshold !== null && gate.threshold !== undefined
        ? `${(gate.threshold * 100).toFixed(0)}%`
        : null)
    : null;

  const cards = [
    {
      id: 'M-01' as const,
      label: 'Cash collected',
      meta: COLLECTIONS_METRIC_DICTIONARY['M-01'],
      value: formatCollectionsMetricValue(m01, '₹'),
      subtext:
        m01 && !m01.computable
          ? m01.reason || 'Reconciled & allocated cash unavailable'
          : 'Reconciled & allocated receipts only',
      isPrimary: true,
    },
    {
      id: 'M-03' as const,
      label: 'Signed cash',
      meta: COLLECTIONS_METRIC_DICTIONARY['M-03'],
      value: formatCollectionsMetricValue(m03, '₹'),
      subtext:
        m03 && !m03.computable && m03.reason
          ? m03.reason
          : 'Confirmed cash deals; excludes in-kind',
      isPrimary: false,
    },
    {
      id: 'M-06' as const,
      label: 'Collection ratio',
      meta: COLLECTIONS_METRIC_DICTIONARY['M-06'],
      value: formatCollectionsMetricValue(m06, 'ratio'),
      subtext:
        m06 && !m06.computable && m06.reason
          ? m06.reason
          : gate
            ? [
                gate.checkpoint_label || 'T−7 gate',
                gateThresholdLabel ? `target ≥ ${gateThresholdLabel}` : null,
                gate.status ? gate.status : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : summary.gatesUnavailable
              ? 'T−7 gate target unavailable'
              : 'Cash collected ÷ signed cash',
      isPrimary: false,
    },
    {
      id: 'M-07' as const,
      label: 'Outstanding cash',
      meta: COLLECTIONS_METRIC_DICTIONARY['M-07'],
      value: formatCollectionsMetricValue(m07, '₹'),
      subtext:
        m07 && !m07.computable && m07.reason
          ? m07.reason
          : 'Owed from signed cash deals',
      isPrimary: false,
    },
  ];

  return (
    <section aria-label="Collections summary" className="space-y-3">
      {!permissionProfile.canViewSummaryMetrics &&
      permissionProfile.verifiedByServer ? (
        <div className="rounded-md border border-[var(--color-border)] bg-white px-5 py-4 text-[14px] text-[var(--color-ink-muted)]">
          Your role does not include access to payment schedules, invoices, or
          cash collection metrics.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.id}
              className={`rounded-xl border p-5 ${card.isPrimary?'metric-hero':'border-[var(--color-border)] bg-white'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-medium text-[var(--color-ink-muted)]">
                    {card.label}
                  </span>
                  <InfoHint
                    label={`${card.label} (${card.id})`}
                    content={`${card.id}: ${card.meta.formula}. ${card.meta.inclusion_exclusion}`}
                  />
                </div>
                <span className="sr-only">
                  {card.id}
                </span>
              </div>

              {loading ? (
                <div className="mt-3 h-7 w-28 animate-pulse rounded bg-[var(--color-canvas)]" />
              ) : (
                <p
                  className={`mt-2 text-[30px] font-semibold tracking-tight tabular-nums ${
                    card.isPrimary ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink)]'
                  }`}
                >
                  {summary.metricsUnavailable ? 'Unavailable' : card.value}
                </p>
              )}

              <p className="mt-1.5 text-[13px] text-[var(--color-ink-subtle)]">{card.subtext}</p>
            </div>
          ))}
        </div>
      )}

      {/* Context strip: freshness + separate M-02 / M-04 / historical guardrail */}
      <details className="source-details"><summary>Financial definitions &amp; source context</summary>
      <div className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-4 py-3 text-[13px] text-[var(--color-ink-muted)] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            Edition:{' '}
            <strong className="font-mono font-medium text-[var(--color-ink)]">
              {editionId}
            </strong>
          </span>
          <span>
            Record class:{' '}
            <strong className="font-mono font-medium text-[var(--color-ink)]">
              {recordClass}
            </strong>
          </span>
          {summary.asOf ? (
            <span>
              As of:{' '}
              <strong className="font-mono font-medium text-[var(--color-ink)]">
                {summary.asOf}
              </strong>
            </span>
          ) : null}
          {summary.dataVersion !== null && summary.dataVersion !== undefined ? (
            <span>
              Data version:{' '}
              <strong className="font-mono font-medium text-[var(--color-ink)]">
                {String(summary.dataVersion)}
              </strong>
            </span>
          ) : null}
          {!summary.metricsUnavailable && (m02 || m04) ? (
            <span className="text-[var(--color-ink-muted)]">
              Separate non-collection totals — Total signed (M-02):{' '}
              <strong className="font-mono font-medium text-[var(--color-ink)]">
                {formatCollectionsMetricValue(m02, '₹')}
              </strong>
              {' · '}In-kind (M-04):{' '}
              <strong className="font-mono font-medium text-[var(--color-ink)]">
                {formatCollectionsMetricValue(m04, '₹')}
              </strong>
            </span>
          ) : null}
        </div>

        <div className="flex items-start gap-1.5 text-[13px] text-[var(--color-ink-muted)]">
          <Info
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-ink-subtle)]"
            aria-hidden="true"
          />
          {isHistorical ? (
            <span>
              2025 historical synthetic records contain no payment schedules,
              invoices, or receipts; M-01, M-06, and M-07 are not computable.
            </span>
          ) : (
            <span>
              Signed cash, invoiced amounts, entered receipts, and reconciled
              collected cash are tracked separately; in-kind deals are excluded.
            </span>
          )}
        </div>
      </div>
      </details>
      <p className="text-[13px] text-[var(--color-ink-muted)]">{isHistorical?'Historical data has no receipt ledger; collected cash is unavailable.':'Collected cash includes only reconciled and allocated receipts. Signed value, invoices and in-kind support remain separate.'}</p>
    </section>
  );
}

