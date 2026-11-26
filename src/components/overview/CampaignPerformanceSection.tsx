import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight } from 'lucide-react';
import { useMemo } from 'react';
import type {
  ApiErrorInfo,
  CampaignPerformanceRow,
  CampaignSortConfig,
  CampaignSortKey,
  DataLoadStatus,
} from '../../types/overview';
import { DataStateWrapper } from '../ui/DataStateWrapper';
import { SectionHeader } from '../ui/SectionHeader';

interface CampaignPerformanceSectionProps {
  campaigns: CampaignPerformanceRow[];
  sortConfig: CampaignSortConfig;
  onChangeSort: (key: CampaignSortKey) => void;
  onOpenCampaignProfile: (campaign: CampaignPerformanceRow | null) => void;
  onNavigateCampaigns: () => void;
  status: DataLoadStatus;
  error: ApiErrorInfo | null;
  onRetry: () => void;
}

const COLUMNS: ReadonlyArray<{
  key: CampaignSortKey;
  label: string;
  align: 'left' | 'right';
}> = [
  { key: 'campaignName', label: 'Campaign', align: 'left' },
  { key: 'ownerName', label: 'Owner', align: 'left' },
  { key: 'pipelineValue', label: 'Pipeline', align: 'right' },
  { key: 'proposalCount', label: 'Proposals', align: 'right' },
  { key: 'signedValue', label: 'Signed value', align: 'right' },
  { key: 'signedCash', label: 'Signed cash (M-03)', align: 'right' },
  { key: 'collectedCash', label: 'Collected (M-01)', align: 'right' },
  { key: 'health', label: 'Health', align: 'left' },
];

export function CampaignPerformanceSection({
  campaigns,
  sortConfig,
  onChangeSort,
  onOpenCampaignProfile,
  onNavigateCampaigns,
  status,
  error,
  onRetry,
}: CampaignPerformanceSectionProps) {
  const sortedCampaigns = useMemo(() => {
    if (campaigns.length === 0) return [];
    const copy = [...campaigns];
    copy.sort((a, b) => {
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      const key = sortConfig.key;
      const aVal = a[key];
      const bVal = b[key];
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * dir;
      }
      return String(aVal).localeCompare(String(bVal)) * dir;
    });
    return copy;
  }, [campaigns, sortConfig]);

  const skeleton = (
    <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-white">
      <div className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-4 py-3">
        <div className="h-3.5 w-full rounded bg-[var(--color-border-subtle)]" />
      </div>
      {[0, 1, 2, 3].map((row) => (
        <div
          key={row}
          className="flex items-center gap-4 border-b border-[var(--color-border-subtle)] px-4 py-3.5 last:border-b-0"
        >
          <div className="h-3.5 w-44 rounded bg-[var(--color-border-subtle)]" />
          <div className="h-3.5 w-24 rounded bg-[var(--color-canvas)]" />
          <div className="ml-auto h-3.5 w-20 rounded bg-[var(--color-border-subtle)]" />
        </div>
      ))}
    </div>
  );

  return (
    <section
      id="section-campaigns"
      aria-label="Campaign performance"
      className="space-y-4"
    >
      <SectionHeader title="Campaign performance" />

      <DataStateWrapper
        status={status}
        error={error}
        onRetry={onRetry}
        loadingSkeleton={skeleton}
      >
        <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)]">
                  {COLUMNS.map((col) => {
                    const isActive = sortConfig.key === col.key;
                    const SortIcon = !isActive
                      ? ArrowUpDown
                      : sortConfig.direction === 'asc'
                        ? ArrowUp
                        : ArrowDown;
                    return (
                      <th
                        key={col.key}
                        scope="col"
                        aria-sort={
                          isActive
                            ? sortConfig.direction === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                        }
                        className={`px-4 py-3 text-[13px] font-medium text-[var(--color-ink-muted)] whitespace-nowrap ${
                          col.align === 'right' ? 'text-right' : 'text-left'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onChangeSort(col.key)}
                          className={`inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors duration-150 hover:text-[var(--color-ink)] ${
                            isActive ? 'font-semibold text-[var(--color-accent)]' : ''
                          }`}
                        >
                          <span>{col.label}</span>
                          <SortIcon
                            className={`h-3 w-3 ${
                              isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink-subtle)]'
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                      </th>
                    );
                  })}
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-[13px] font-medium text-[var(--color-ink-muted)] whitespace-nowrap"
                  >
                    Profile
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[var(--color-border-subtle)] text-[14px]">
                {sortedCampaigns.length > 0 ? (
                  sortedCampaigns.map((row) => (
                    <tr
                      key={row.id}
                      className="transition-colors duration-150 hover:bg-[var(--color-surface-subtle)]"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                        {row.campaignName}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink-muted)]">
                        {row.ownerName}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--color-ink)]">
                        {row.pipelineFormatted ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--color-ink)]">
                        {row.proposalCount ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--color-ink)]">
                        {row.signedFormatted ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--color-ink)]">
                        {row.signedCashFormatted ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-medium text-[var(--color-accent)]">
                        {row.collectedCashFormatted ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink-muted)]">
                        {row.healthLabel}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenCampaignProfile(row)}
                          className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--color-accent)] hover:underline whitespace-nowrap"
                        >
                          Open
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-6 py-10 text-center">
                      <p className="text-[14px] font-medium text-[var(--color-ink)]">
                        No campaigns yet
                      </p>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={onNavigateCampaigns}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-[13px] font-medium text-[var(--color-ink)] transition-colors duration-150 hover:bg-[var(--color-surface-subtle)]"
                        >
                          Go to Campaigns
                          <ArrowUpRight className="h-3.5 w-3.5 text-[var(--color-ink-subtle)]" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DataStateWrapper>
    </section>
  );
}
