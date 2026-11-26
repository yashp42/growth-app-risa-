import { Lock, RefreshCw, Trash2 } from 'lucide-react';
import { useSeason } from '../../contexts/SeasonContext';
import {
  READ_ONLY_2025_MESSAGE,
  formatEditionSwitcherLabel,
} from '../../lib/dateIst';
import { DEFAULT_FILTER_OPTIONS } from '../../services/overviewApi';
import type { SavedAnalystView } from '../../types/analyst';
import type {
  DataClassFilter,
  FilterOption,
  OverviewFilterState,
} from '../../types/overview';
import { SelectControl } from '../ui/SelectControl';

export type PreviewStateMode = 'default' | 'loading' | 'error';

interface OverviewHeaderFiltersProps {
  filters: OverviewFilterState;
  campaignOptions: FilterOption[];
  onChangeDataClass: (dataClass: DataClassFilter) => void;
  onChangeCampaignId: (campaignId: string) => void;
  showDevControls: boolean;
  previewMode: PreviewStateMode;
  onChangePreviewMode: (mode: PreviewStateMode) => void;
  onRefresh: () => void;
  asOfTimestamp: string | null;
  savedViews?: SavedAnalystView[];
  activeSavedViewId?: string | null;
  hasActiveView?: boolean;
  onSelectSavedView?: (view: SavedAnalystView) => void;
  onDeleteSavedView?: (id: string) => void;
  onClearActiveView?: () => void;
}

export function OverviewHeaderFilters({
  filters,
  campaignOptions,
  onChangeDataClass,
  onChangeCampaignId,
  showDevControls,
  previewMode,
  onChangePreviewMode,
  onRefresh,
  asOfTimestamp,
  savedViews = [],
  activeSavedViewId = null,
  hasActiveView = false,
  onSelectSavedView,
  onDeleteSavedView,
  onClearActiveView,
}: OverviewHeaderFiltersProps) {
  const {
    editions,
    editionId,
    recordClass,
    asOf,
    isReadOnlyHistorical,
    setEditionId,
    setAsOf,
  } = useSeason();

  const editionOptions: FilterOption[] = editions.map((ed) => ({
    value: ed.edition_id,
    label: formatEditionSwitcherLabel(ed.edition_id, ed.name),
  }));

  return (
    <section
      aria-labelledby="overview-heading"
      className="border-b border-[var(--color-border)] pb-6"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1
              id="overview-heading"
              className="page-heading text-[var(--color-ink)]"
            >
              Growth overview
            </h1>
            {isReadOnlyHistorical ? (
              <span className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2 py-0.5 font-mono text-[12px] font-medium text-[var(--color-ink-muted)]">
                <Lock className="h-3 w-3 text-[var(--color-ink-subtle)]" aria-hidden="true" />
                {READ_ONLY_2025_MESSAGE}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[14px] text-[var(--color-ink-muted)]">
            Sponsorship performance, pacing gates, and rule status.{' '}
            <span className="font-mono text-[13px] text-[var(--color-ink-subtle)]">
              {editionId} · {recordClass} · As of {asOfTimestamp || asOf}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {showDevControls ? (
            <div className="flex items-center gap-2 rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2.5 py-1">
              <span className="font-mono text-[12px] text-[var(--color-ink-subtle)] whitespace-nowrap">
                Dev state
              </span>
              <div
                role="group"
                aria-label="Developer preview dashboard data state"
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
                    className={`rounded px-2.5 py-0.5 text-[13px] font-medium transition-colors duration-150 whitespace-nowrap ${
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

          <span className="font-mono text-[12px] text-[var(--color-ink-subtle)] tabular-nums whitespace-nowrap">
            As of {asOfTimestamp || asOf} · {recordClass}
          </span>

          {onSelectSavedView ? (
            <div className="flex items-center gap-1">
              <label htmlFor="overview-my-views" className="sr-only">
                My views
              </label>
              <select
                id="overview-my-views"
                aria-label="My views"
                value={activeSavedViewId ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  if (val === '__clear__') {
                    onClearActiveView?.();
                    return;
                  }
                  const found = savedViews.find((v) => v.id === val);
                  if (found) onSelectSavedView(found);
                }}
                className="h-8 max-w-[200px] rounded-xl border border-[var(--color-border)] bg-white px-2.5 text-[13px] font-medium text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="">
                  {savedViews.length > 0
                    ? `My views (${savedViews.length})`
                    : 'My views'}
                </option>
                {hasActiveView ? (
                  <option value="__clear__">Hide My view</option>
                ) : null}
                {savedViews.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              {activeSavedViewId && onDeleteSavedView ? (
                <button
                  type="button"
                  onClick={() => onDeleteSavedView(activeSavedViewId)}
                  aria-label="Delete selected saved view"
                  title="Delete saved view"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-ink-subtle)] hover:text-[#9B3B32]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 text-[13px] font-medium text-[var(--color-ink)] transition-colors duration-150 hover:bg-[var(--color-surface-subtle)] whitespace-nowrap"
          >
            <RefreshCw className="h-3.5 w-3.5 text-[var(--color-ink-muted)]" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {/* Global filter bar bound to SeasonContext */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectControl
          id="filter-edition"
          label="Festival edition"
          value={editionId}
          options={editionOptions}
          onChange={(nextEditionId) => setEditionId(nextEditionId)}
        />

        <div className="flex flex-col gap-1">
          <label
            htmlFor="filter-as-of"
            className="text-[12px] font-medium text-[var(--color-ink-subtle)]"
          >
            As of date (IST)
          </label>
          <input
            id="filter-as-of"
            type="date"
            value={asOf}
            onChange={(e) => {
              if (e.target.value) setAsOf(e.target.value);
            }}
            className="h-9 rounded-xl border border-[var(--color-border)] bg-white px-3 font-mono text-[14px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>

        <SelectControl
          id="filter-data-class"
          label="Support type view"
          value={filters.dataClass}
          options={DEFAULT_FILTER_OPTIONS.dataClasses}
          onChange={(value) => onChangeDataClass(value as DataClassFilter)}
        />

        <SelectControl
          id="filter-campaign"
          label="Campaign"
          value={filters.campaignId}
          options={
            campaignOptions.length > 0
              ? campaignOptions
              : DEFAULT_FILTER_OPTIONS.campaigns
          }
          onChange={(campaignId) => onChangeCampaignId(campaignId)}
        />
      </div>
    </section>
  );
}

