import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSeason } from '../../contexts/SeasonContext';
import {
  READ_ONLY_2025_MESSAGE,
  isHistoricalReadOnlyEdition,
} from '../../lib/dateIst';
import {
  SPONSOR_EDITION_BY_CLASS,
  SPONSOR_FIRST_SOURCE_OPTIONS,
  SPONSOR_LIFECYCLE_OPTIONS,
  SPONSOR_RECORD_CLASS_OPTIONS,
  canUserEditSponsor,
  formatFirstSource,
  formatLifecycleStatus,
  formatSponsorRecordClass,
  getDefaultSponsorEditionForClass,
  isSponsorReadOnly,
} from '../../services/sponsorsApi';
import type {
  ApiErrorInfo,
  DataLoadStatus,
  FilterOption,
  SortDirection,
} from '../../types/overview';
import type {
  SponsorDirectoryFilters,
  SponsorEntity,
  SponsorRecordClass,
  SponsorSortKey,
  UserPermissionContext,
} from '../../types/sponsors';
import type { PreviewStateMode } from '../overview/OverviewHeaderFilters';
import { DataStateWrapper } from '../ui/DataStateWrapper';
import { SelectControl } from '../ui/SelectControl';

interface SponsorDirectoryPageProps {
  filters: SponsorDirectoryFilters;
  onChangeFilters: (next: SponsorDirectoryFilters) => void;
  sponsors: SponsorEntity[];
  categoryOptions: FilterOption[];
  cityOptions: FilterOption[];
  permissions: UserPermissionContext;
  status: DataLoadStatus;
  error: ApiErrorInfo | null;
  onRetry: () => void;
  onRefresh: () => void;
  onCreateSponsor: () => void;
  onEditSponsor: (sponsor: SponsorEntity) => void;
  onOpenSponsor: (sponsor: SponsorEntity) => void;
  showDevControls: boolean;
  previewMode: PreviewStateMode;
  onChangePreviewMode: (mode: PreviewStateMode) => void;
}

const COLUMNS: ReadonlyArray<{
  key: SponsorSortKey;
  label: string;
}> = [
  { key: 'display_name', label: 'Organisation' },
  { key: 'category_id', label: 'Category' },
  { key: 'lifecycle_status', label: 'Lifecycle status' },
  { key: 'first_source', label: 'First source' },
  { key: 'city', label: 'City' },
  { key: 'record_class', label: 'Record class' },
];

export function SponsorDirectoryPage({
  filters,
  onChangeFilters,
  sponsors,
  categoryOptions,
  cityOptions,
  permissions,
  status,
  error,
  onRetry,
  onRefresh,
  onCreateSponsor,
  onEditSponsor,
  onOpenSponsor,
  showDevControls,
  previewMode,
  onChangePreviewMode,
}: SponsorDirectoryPageProps) {
  const { asOf } = useSeason();
  const [sortKey, setSortKey] = useState<SponsorSortKey>('display_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const isHistorical2025 = isHistoricalReadOnlyEdition(
    filters.edition_id,
    filters.record_class
  );
  const isReadOnlyClass =
    isHistorical2025 || filters.record_class === 'external_research';
  const roleAllowsWrite =
    !permissions.verified_by_server || permissions.can_write_sponsors;
  const canCreate = !isReadOnlyClass && roleAllowsWrite;

  const editionOptions = SPONSOR_EDITION_BY_CLASS[filters.record_class];

  const handleSort = (key: SponsorSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedSponsors = useMemo(() => {
    if (sponsors.length === 0) return [];
    const copy = [...sponsors];
    const dir = sortDirection === 'asc' ? 1 : -1;

    copy.sort((a, b) => {
      const getVal = (sp: SponsorEntity): string | null => {
        switch (sortKey) {
          case 'display_name':
            return sp.display_name;
          case 'category_id':
            return sp.category_name || sp.category_id || null;
          case 'lifecycle_status':
            return formatLifecycleStatus(sp.lifecycle_status);
          case 'first_source':
            return formatFirstSource(sp.first_source);
          case 'city':
            return sp.city ?? null;
          case 'record_class':
            return formatSponsorRecordClass(sp.record_class);
        }
      };

      const av = getVal(a);
      const bv = getVal(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return av.localeCompare(bv) * dir;
    });

    return copy;
  }, [sponsors, sortKey, sortDirection]);

  const skeleton = (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
      <div className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-4 py-3">
        <div className="h-3.5 w-full rounded bg-[var(--color-border-subtle)]" />
      </div>
      {[0, 1, 2, 3].map((idx) => (
        <div
          key={idx}
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
    <div className="space-y-8 pb-8">
      {/* Header & Filters */}
      <section className="border-b border-[var(--color-border)] pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="page-heading text-[var(--color-ink)]">
              Sponsors
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[12px] text-[var(--color-ink-subtle)]">
              <span>{formatSponsorRecordClass(filters.record_class)}</span>
              {filters.edition_id !== 'all' ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{filters.edition_id}</span>
                </>
              ) : null}
              <span aria-hidden="true">·</span>
              <span>As of {asOf}</span>
              {isReadOnlyClass ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-[var(--color-ink-muted)]">
                    {isHistorical2025 ? READ_ONLY_2025_MESSAGE : 'Read-only'}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {showDevControls ? (
              <div className="flex items-center gap-2 rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2.5 py-1">
                <span className="font-mono text-[12px] text-[var(--color-ink-subtle)]">
                  Dev state
                </span>
                <div
                  role="group"
                  aria-label="Developer preview sponsors data state"
                  className="inline-flex rounded border border-[var(--color-border)] bg-white p-0.5"
                >
                  {(
                    [
                      { id: 'default', label: 'Live' },
                      { id: 'loading', label: 'Loading' },
                      { id: 'error', label: 'Error' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => onChangePreviewMode(mode.id)}
                      className={`rounded px-2 py-0.5 text-[13px] font-medium transition-colors duration-150 ${
                        previewMode === mode.id
                          ? 'bg-[var(--color-accent)] text-white'
                          : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 text-[13px] font-medium text-[var(--color-ink)] transition-colors duration-150 hover:bg-[var(--color-surface-subtle)] whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5 text-[var(--color-ink-muted)]" aria-hidden="true" />
              Refresh
            </button>

            {roleAllowsWrite ? (
              <button
                type="button"
                onClick={onCreateSponsor}
                disabled={!canCreate}
                title={isHistorical2025 ? READ_ONLY_2025_MESSAGE : undefined}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3.5 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                New sponsor
              </button>
            ) : null}
          </div>
        </div>

        {/* Search & filter grid */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="sponsors-search"
              className="text-[12px] font-medium text-[var(--color-ink-subtle)]"
            >
              Search
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-subtle)]"
                aria-hidden="true"
              />
              <input
                id="sponsors-search"
                type="text"
                value={filters.search}
                onChange={(e) =>
                  onChangeFilters({ ...filters, search: e.target.value })
                }
                placeholder="Search by sponsor name..."
                className="h-9 w-full rounded-xl border border-[var(--color-border)] bg-white pr-3 pl-8 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </div>
          </div>

          <SelectControl
            id="sponsors-filter-record-class"
            label="Record class"
            value={filters.record_class}
            options={SPONSOR_RECORD_CLASS_OPTIONS}
            onChange={(value) => {
              const nextClass = value as SponsorRecordClass;
              onChangeFilters({
                ...filters,
                record_class: nextClass,
                edition_id: getDefaultSponsorEditionForClass(nextClass),
              });
            }}
          />

          <SelectControl
            id="sponsors-filter-edition"
            label="Festival edition"
            value={filters.edition_id}
            options={editionOptions}
            onChange={(edition_id) =>
              onChangeFilters({ ...filters, edition_id })
            }
          />

          <SelectControl
            id="sponsors-filter-lifecycle"
            label="Lifecycle status"
            value={filters.lifecycle_status}
            options={SPONSOR_LIFECYCLE_OPTIONS}
            onChange={(lifecycle_status) =>
              onChangeFilters({ ...filters, lifecycle_status })
            }
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SelectControl
            id="sponsors-filter-category"
            label="Category"
            value={filters.category_id}
            options={categoryOptions}
            onChange={(category_id) =>
              onChangeFilters({ ...filters, category_id })
            }
          />

          <SelectControl
            id="sponsors-filter-first-source"
            label="First source"
            value={filters.first_source}
            options={SPONSOR_FIRST_SOURCE_OPTIONS}
            onChange={(first_source) =>
              onChangeFilters({ ...filters, first_source })
            }
          />

          <SelectControl
            id="sponsors-filter-city"
            label="City"
            value={filters.city}
            options={cityOptions}
            onChange={(city) => onChangeFilters({ ...filters, city })}
          />
        </div>
      </section>

      {/* Directory Table */}
      <section aria-label="Sponsor directory">
        <DataStateWrapper
          status={status}
          error={error}
          onRetry={onRetry}
          loadingSkeleton={skeleton}
        >
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)]">
                    {COLUMNS.map((col) => {
                      const isActive = sortKey === col.key;
                      const SortIcon = !isActive
                        ? ArrowUpDown
                        : sortDirection === 'asc'
                          ? ArrowUp
                          : ArrowDown;
                      return (
                        <th
                          key={col.key}
                          scope="col"
                          aria-sort={
                            isActive
                              ? sortDirection === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                          className="px-4 py-3 text-[13px] font-medium text-[var(--color-ink-muted)] whitespace-nowrap"
                        >
                          <button
                            type="button"
                            onClick={() => handleSort(col.key)}
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
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[var(--color-border-subtle)] text-[14px]">
                  {sortedSponsors.length > 0 ? (
                    sortedSponsors.map((sponsor) => {
                      const readOnly = isSponsorReadOnly(sponsor);
                      const editable = canUserEditSponsor(sponsor, permissions);
                      return (
                        <tr
                          key={sponsor.sponsor_id}
                          className="transition-colors duration-150 hover:bg-[var(--color-surface-subtle)]"
                        >
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => onOpenSponsor(sponsor)}
                              className="text-left font-medium text-[var(--color-ink)] hover:text-[var(--color-accent)] hover:underline"
                            >
                              <span aria-hidden="true" className="mr-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] align-middle text-xs font-semibold text-[var(--color-accent)]">{(sponsor.display_name||'S').slice(0,2).toUpperCase()}</span>{sponsor.display_name}
                            </button>
                            {sponsor.legal_name &&
                            sponsor.legal_name !== sponsor.display_name ? (
                              <span className="mt-0.5 block text-[13px] text-[var(--color-ink-subtle)]">
                                {sponsor.legal_name}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-[var(--color-ink-muted)] whitespace-nowrap">
                            {sponsor.category_name || sponsor.category_id || '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={
                                sponsor.lifecycle_status === 'do_not_contact'
                                  ? 'font-medium text-[#9B3B32]'
                                  : sponsor.lifecycle_status === 'active'
                                    ? 'font-medium text-[var(--color-accent)]'
                                    : 'text-[var(--color-ink)]'
                              }
                            >
                              {formatLifecycleStatus(sponsor.lifecycle_status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[var(--color-ink-muted)] whitespace-nowrap">
                            {formatFirstSource(sponsor.first_source)}
                          </td>
                          <td className="px-4 py-3 text-[var(--color-ink-muted)] whitespace-nowrap">
                            {sponsor.city || '—'}
                          </td>
                          <td className="px-4 py-3 font-mono text-[13px] text-[var(--color-ink-muted)] whitespace-nowrap">
                            {formatSponsorRecordClass(sponsor.record_class)}
                            {readOnly ? (
                              <span className="ml-1.5 text-[12px] text-[var(--color-ink-subtle)]">
                                · Read-only
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-3">
                              {editable || (isHistorical2025 && roleAllowsWrite) ? (
                                <button
                                  type="button"
                                  disabled={!editable || isHistorical2025}
                                  title={
                                    isHistorical2025
                                      ? READ_ONLY_2025_MESSAGE
                                      : undefined
                                  }
                                  onClick={() => onEditSponsor(sponsor)}
                                  className="text-[13px] font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Edit
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => onOpenSponsor(sponsor)}
                                className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--color-accent)] hover:underline"
                              >
                                Open
                                <ArrowUpRight
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center">
                        <p className="text-[14px] font-medium text-[var(--color-ink)]">
                          No sponsors yet
                        </p>
                        {roleAllowsWrite ? (
                          <div className="mt-3">
                            <button
                              type="button"
                              disabled={!canCreate}
                              title={
                                isHistorical2025
                                  ? READ_ONLY_2025_MESSAGE
                                  : undefined
                              }
                              onClick={onCreateSponsor}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-[13px] font-medium text-[var(--color-ink)] transition-colors duration-150 hover:bg-[var(--color-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Plus
                                className="h-3.5 w-3.5 text-[var(--color-accent)]"
                                aria-hidden="true"
                              />
                              Register sponsor
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DataStateWrapper>
      </section>
    </div>
  );
}

