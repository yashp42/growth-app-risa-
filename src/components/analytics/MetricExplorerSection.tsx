import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  ANALYTICS_METRIC_UI_HINTS,
  formatAnalyticsMetricValue,
  formatAppliedFiltersSummary,
  formatNumeratorDenominator,
  querySingleAnalyticsMetric,
} from '../../services/analyticsApi';
import type {
  AnalyticsFilters,
  AnalyticsPermissionProfile,
  KpiReferenceRecord,
  MetricReferenceRecord,
} from '../../types/analytics';
import type { MetricQueryResult } from '../../types/campaigns';
import { EmptyStateNotice } from '../ui/DataStateWrapper';

interface MetricExplorerSectionProps {
  metricDefinitions: MetricReferenceRecord[];
  kpiDefinitions: KpiReferenceRecord[];
  metricsAvailable: boolean;
  kpisAvailable: boolean;
  coreResults: Record<string, MetricQueryResult>;
  filters: AnalyticsFilters;
  permissionProfile: AnalyticsPermissionProfile;
}

const RESTRICTED_VIEWER_IDS = new Set(['M-01', 'M-06', 'M-07', 'M-25', 'M-27']);

export function MetricExplorerSection({
  metricDefinitions,
  kpiDefinitions,
  metricsAvailable,
  kpisAvailable,
  coreResults,
  filters,
  permissionProfile,
}: MetricExplorerSectionProps) {
  const [search, setSearch] = useState('');
  const [selectedMetricId, setSelectedMetricId] = useState<string>('');
  const [liveResult, setLiveResult] = useState<MetricQueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  const kpisById = useMemo(() => {
    const map = new Map<string, KpiReferenceRecord>();
    for (const k of kpiDefinitions) {
      map.set(k.kpi_id, k);
    }
    return map;
  }, [kpiDefinitions]);

  const filteredMetrics = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return metricDefinitions;
    return metricDefinitions.filter((m) => {
      const hay = [
        m.metric_id,
        m.name,
        m.kpi_id,
        m.business_meaning,
        m.formula,
        m.value_nature,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [metricDefinitions, search]);

  useEffect(() => {
    if (
      filteredMetrics.length > 0 &&
      !filteredMetrics.some((m) => m.metric_id === selectedMetricId)
    ) {
      setSelectedMetricId(filteredMetrics[0].metric_id);
    }
  }, [filteredMetrics, selectedMetricId]);

  const selectedMetric =
    filteredMetrics.find((m) => m.metric_id === selectedMetricId) ??
    filteredMetrics[0] ??
    null;

  const selectedKpi = selectedMetric?.kpi_id
    ? kpisById.get(selectedMetric.kpi_id) ??
      kpiDefinitions.find((k) => k.metric_id === selectedMetric.metric_id) ??
      null
    : selectedMetric
      ? kpiDefinitions.find((k) => k.metric_id === selectedMetric.metric_id) ??
        null
      : null;

  useEffect(() => {
    if (!selectedMetric) {
      setLiveResult(null);
      setQueryError(null);
      return;
    }

    if (
      permissionProfile.isViewerRestricted &&
      RESTRICTED_VIEWER_IDS.has(selectedMetric.metric_id)
    ) {
      setLiveResult(null);
      setQueryError('Restricted for your assigned role.');
      return;
    }

    if (coreResults[selectedMetric.metric_id]) {
      setLiveResult(coreResults[selectedMetric.metric_id]);
      setQueryError(null);
      return;
    }

    const controller = new AbortController();
    setQueryLoading(true);
    setQueryError(null);

    querySingleAnalyticsMetric(
      selectedMetric.metric_id,
      filters,
      controller.signal
    )
      .then((res) => {
        setLiveResult(res);
        setQueryLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setLiveResult(null);
        setQueryError(
          err instanceof Error ? err.message : 'Unable to evaluate metric.'
        );
        setQueryLoading(false);
      });

    return () => controller.abort();
  }, [selectedMetric, coreResults, filters, permissionProfile.isViewerRestricted]);

  return (
    <section aria-labelledby="metric-explorer-heading" className="space-y-4">
      <div>
        <h2
          id="metric-explorer-heading"
          className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
        >
          Explore measures
        </h2>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          Browse business measures and their results for the selected season.
        </p>
      </div>

      {!metricsAvailable || metricDefinitions.length === 0 ? (
        <EmptyStateNotice
          title="Metric dictionary reference is currently unavailable"
          description="Measure definitions could not be loaded. Try refreshing this page."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left: Searchable Metric List */}
          <div className="rounded-md border border-[var(--color-border)] bg-white lg:col-span-5">
            <div className="border-b border-[var(--color-border)] p-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-subtle)]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search measures..."
                  aria-label="Search metric definitions"
                  className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-subtle)] pl-9 pr-3 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] focus:border-[var(--color-accent)] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="max-h-[540px] divide-y divide-[var(--color-border-subtle)] overflow-y-auto">
              {filteredMetrics.length === 0 ? (
                <p className="p-4 text-[14px] text-[var(--color-ink-muted)]">
                  No metric definitions match your search.
                </p>
              ) : (
                filteredMetrics.map((m) => {
                  const isSelected =
                    selectedMetric?.metric_id === m.metric_id;
                  return (
                    <button
                      key={m.metric_id}
                      type="button"
                      onClick={() => setSelectedMetricId(m.metric_id)}
                      className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? 'bg-[var(--color-accent-soft)]/60'
                          : 'hover:bg-[var(--color-surface-subtle)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-[var(--color-ink)]">
                          {m.name}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-[var(--color-ink-subtle)]">
                          {[m.unit]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>

                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Definition + Live Metric Result */}
          <div className="space-y-4 lg:col-span-7">
            {selectedMetric ? (
              <>
                {/* Live Computed Result Box */}
                <div className="rounded-md border border-[var(--color-border)] bg-white p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-border-subtle)] pb-3">
                    <div>

                      <h3 className="mt-0.5 text-[16px] font-semibold text-[var(--color-ink)]">
                        {selectedMetric.name}
                      </h3>
                    </div>

                  </div>

                  {queryLoading ? (
                    <div className="mt-4 h-10 w-36 animate-pulse rounded bg-[var(--color-surface-subtle)]" />
                  ) : queryError ? (
                    <p className="mt-4 text-[14px] text-[var(--color-ink-muted)]">
                      {queryError}
                    </p>
                  ) : !liveResult ? (
                    <p className="mt-4 text-[14px] text-[var(--color-ink-muted)]">
                      Metric output is unavailable for the active context.
                    </p>
                  ) : !liveResult.computable ? (
                    <div className="mt-4 space-y-1">
                      <p className="font-mono text-[16px] font-medium text-[var(--color-ink-muted)]">
                        Not computable
                      </p>
                      <p className="text-[13px] text-[var(--color-ink-subtle)]">
                        {liveResult.reason ||
                          'Required inputs are absent in this dataset.'}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap items-baseline justify-between gap-4">
                      <div>
                        <p className="font-mono text-[24px] font-semibold tabular-nums text-[var(--color-accent)]">
                          {formatAnalyticsMetricValue(
                            liveResult,
                            selectedMetric.unit
                          )}
                        </p>
                        {formatNumeratorDenominator(liveResult) ? (
                          <details className="source-details"><summary>Calculation</summary>{formatNumeratorDenominator(liveResult)}</details>
                        ) : null}
                      </div>
                      <details className="text-right font-mono text-[12px] text-[var(--color-ink-subtle)]"><summary>Source details</summary>
                        <div>
                          {liveResult.record_class}
                          {liveResult.as_of ? ` · as of ${liveResult.as_of}` : ''}
                          {liveResult.data_version !== undefined &&
                          liveResult.data_version !== null
                            ? ` · v${String(liveResult.data_version)}`
                            : ''}
                        </div>
                        <div>
                          Filters:{' '}
                          {formatAppliedFiltersSummary(
                            liveResult.applied_filters
                          )}
                        </div>
                      </details>
                    </div>
                  )}
                </div>

                {/* Read-Only Reference Definition */}
                <details className="rounded-md border border-[var(--color-border)] bg-white p-5">
                  <summary className="text-sm font-medium">Definition &amp; calculation</summary>
                  <h4 className="border-b border-[var(--color-border-subtle)] pb-2.5 text-[14px] font-semibold text-[var(--color-ink)]">
                    Reference definition
                  </h4>

                  <dl className="mt-3 divide-y divide-[var(--color-border-subtle)] text-[13px]">
                    <div className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-3">
                      <dt className="font-medium text-[var(--color-ink-muted)]">
                        Business meaning
                      </dt>
                      <dd className="text-[var(--color-ink)] sm:col-span-2">
                        {selectedMetric.business_meaning || '—'}
                      </dd>
                    </div>
                    <div className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-3">
                      <dt className="font-medium text-[var(--color-ink-muted)]">Formula</dt>
                      <dd className="font-mono text-[var(--color-ink)] sm:col-span-2">
                        {selectedMetric.formula}
                      </dd>
                    </div>
                    <div className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-3">
                      <dt className="font-medium text-[var(--color-ink-muted)]">
                        Numerator / Denominator
                      </dt>
                      <dd className="text-[var(--color-ink)] sm:col-span-2">
                        {selectedMetric.numerator || '—'} ÷{' '}
                        {selectedMetric.denominator || '—'}
                      </dd>
                    </div>
                    <div className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-3">
                      <dt className="font-medium text-[var(--color-ink-muted)]">
                        Aggregation &amp; Unit
                      </dt>
                      <dd className="text-[var(--color-ink)] sm:col-span-2">
                        {[selectedMetric.aggregation, selectedMetric.unit]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </dd>
                    </div>
                    <div className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-3">
                      <dt className="font-medium text-[var(--color-ink-muted)]">
                        Time period
                      </dt>
                      <dd className="text-[var(--color-ink)] sm:col-span-2">
                        {selectedMetric.time_period || '—'}
                      </dd>
                    </div>
                    <div className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-3">
                      <dt className="font-medium text-[var(--color-ink-muted)]">
                        Inclusion / Exclusion
                      </dt>
                      <dd className="text-[var(--color-ink)] sm:col-span-2">
                        {selectedMetric.inclusion_exclusion || '—'}
                      </dd>
                    </div>
                    <div className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-3">
                      <dt className="font-medium text-[var(--color-ink-muted)]">
                        Value nature &amp; 2025 availability
                      </dt>
                      <dd className="text-[var(--color-ink)] sm:col-span-2">
                        {selectedMetric.value_nature || '—'} · 2025 computable:{' '}
                        {selectedMetric.computable_2025 === true ||
                        selectedMetric.computable_2025 === 'yes'
                          ? 'Yes'
                          : selectedMetric.computable_2025 === false ||
                              selectedMetric.computable_2025 === 'no'
                            ? 'No'
                            : String(selectedMetric.computable_2025 || '—')}
                      </dd>
                    </div>
                    <div className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-3">
                      <dt className="font-medium text-[var(--color-ink-muted)]">
                        Related KPI
                      </dt>
                      <dd className="text-[var(--color-ink)] sm:col-span-2">
                        {selectedKpi ? (
                          <div>
                            <span className="font-mono font-medium">
                              {selectedKpi.kpi_id}
                            </span>{' '}
                            · {selectedKpi.name}
                            {selectedKpi.definition ? (
                              <span className="mt-0.5 block text-[var(--color-ink-muted)]">
                                {selectedKpi.definition}
                              </span>
                            ) : null}
                          </div>
                        ) : selectedMetric.kpi_id ? (
                          <span className="font-mono">
                            {selectedMetric.kpi_id}
                            {!kpisAvailable ? ' (KPI catalog unavailable)' : ''}
                          </span>
                        ) : (
                          '—'
                        )}
                      </dd>
                    </div>
                  </dl>
                  <p>{selectedMetric.metric_id} · {liveResult?.definition_version}</p>
                </details>
              </>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

