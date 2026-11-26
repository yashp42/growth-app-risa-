import { ArrowUpRight, PanelRightClose } from 'lucide-react';
import { formatRecordClassLabel } from '../../services/analystApi';
import type { GrowthAnalystSessionFilterState } from '../../hooks/useGrowthAnalystSession';
import type {
  AiPermissionProfile,
  AiStructuredResponse,
} from '../../types/analyst';
import type { NavSectionId } from '../../types/overview';
import { CitationList } from './CitationList';
import { MetricEvidenceCard } from './MetricEvidenceCard';

interface EvidencePanelProps {
  filters: GrowthAnalystSessionFilterState;
  dataVersion: string | number | null;
  latestStructured: AiStructuredResponse | null;
  activeContextSection: NavSectionId;
  activeRecordContext?: {
    entityType: 'campaign' | 'sponsor' | 'opportunity' | 'task';
    entityId: string;
  } | null;
  permissionProfile: AiPermissionProfile;
  onCollapse?: () => void;
  onOpenLinkedRecord?: (entityType: string, entityId: string) => void;
}

export function EvidencePanel({
  filters,
  dataVersion,
  latestStructured,
  activeContextSection,
  activeRecordContext,
  permissionProfile,
  onCollapse,
  onOpenLinkedRecord,
}: EvidencePanelProps) {
  const activeFilterEntries = [
    filters.campaign_id && filters.campaign_id !== 'all'
      ? `Campaign: ${filters.campaign_id}`
      : null,
    filters.channel_id && filters.channel_id !== 'all'
      ? `Channel: ${filters.channel_id}`
      : null,
    filters.bet_id && filters.bet_id !== 'all'
      ? `Bet: ${filters.bet_id}`
      : null,
    filters.owner_id && filters.owner_id !== 'all'
      ? `Owner: ${filters.owner_id}`
      : null,
    filters.category_id && filters.category_id !== 'all'
      ? `Category: ${filters.category_id}`
      : null,
  ].filter(Boolean) as string[];

  return (
    <aside
      aria-label="Evidence and context"
      className="space-y-4 rounded-md border border-[var(--color-border)] bg-white p-4"
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-3">
        <h2 className="text-[14px] font-semibold text-[var(--color-ink)]">
          Evidence &amp; context
        </h2>
        {onCollapse ? (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse evidence panel"
            className="hidden h-7 w-7 items-center justify-center rounded text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)] lg:inline-flex"
          >
            <PanelRightClose className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {/* Active Data Scope */}
      <dl className="space-y-2 text-[13px]">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[var(--color-ink-subtle)]">Data class</dt>
          <dd className="text-right font-medium text-[var(--color-ink)]">
            {formatRecordClassLabel(filters.record_class)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[var(--color-ink-subtle)]">Edition</dt>
          <dd className="font-mono text-[var(--color-ink)]">{filters.edition_id}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[var(--color-ink-subtle)]">As of</dt>
          <dd className="font-mono text-[var(--color-ink)]">{filters.as_of}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[var(--color-ink-subtle)]">Data version</dt>
          <dd className="font-mono text-[var(--color-ink)]">
            {dataVersion !== null && dataVersion !== undefined
              ? `v${String(dataVersion)}`
              : 'Unavailable'}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[var(--color-ink-subtle)]">Workspace context</dt>
          <dd className="font-mono text-[var(--color-ink-muted)]">
            {activeRecordContext
              ? `${activeRecordContext.entityType} ${activeRecordContext.entityId}`
              : activeContextSection}
          </dd>
        </div>
      </dl>

      {activeFilterEntries.length > 0 ? (
        <div className="border-t border-[var(--color-border-subtle)] pt-3">
          <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">Active filters</p>
          <p className="mt-1 font-mono text-[12px] text-[var(--color-ink)]">
            {activeFilterEntries.join(' · ')}
          </p>
        </div>
      ) : null}

      {/* Latest Answer Provenance & Tools */}
      {latestStructured ? (
        <>
          {latestStructured.data_labels.length > 0 ? (
            <div className="border-t border-[var(--color-border-subtle)] pt-3">
              <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                Source labels
              </p>
              <p className="mt-1 text-[13px] text-[var(--color-ink)]">
                {latestStructured.data_labels.join(' · ')}
              </p>
            </div>
          ) : null}

          {latestStructured.metric_results &&
          latestStructured.metric_results.length > 0 ? (
            <div className="space-y-2.5 border-t border-[var(--color-border-subtle)] pt-3">
              <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                Metrics queried ({latestStructured.metric_results.length})
              </p>
              {latestStructured.metric_results.map((m, idx) => (
                <MetricEvidenceCard
                  key={`${m.metric_id}-panel-${idx}`}
                  metric={m}
                  compact
                />
              ))}
            </div>
          ) : null}

          {latestStructured.citations.length > 0 ? (
            <div className="border-t border-[var(--color-border-subtle)] pt-3">
              <CitationList citations={latestStructured.citations} compact />
            </div>
          ) : null}

          {latestStructured.linked_records &&
          latestStructured.linked_records.length > 0 &&
          !permissionProfile.isViewerRestricted ? (
            <div className="space-y-1.5 border-t border-[var(--color-border-subtle)] pt-3">
              <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                Linked records
              </p>
              <ul className="divide-y divide-[var(--color-border-subtle)] rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]">
                {latestStructured.linked_records.map((rec) => (
                  <li
                    key={`${rec.entity_type}:${rec.entity_id}`}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--color-ink)]">
                        {rec.label}
                      </p>
                      <p className="truncate font-mono text-[12px] text-[var(--color-ink-subtle)]">
                        {rec.entity_type} · {rec.entity_id}
                      </p>
                    </div>
                    {onOpenLinkedRecord ? (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenLinkedRecord(rec.entity_type, rec.entity_id)
                        }
                        aria-label={`Open ${rec.label}`}
                        className="shrink-0 text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {latestStructured.tool_calls &&
          latestStructured.tool_calls.length > 0 ? (
            <div className="border-t border-[var(--color-border-subtle)] pt-3">
              <p className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                Tools invoked ({latestStructured.tool_calls.length}/6)
              </p>
              <ul className="mt-1.5 space-y-1 font-mono text-[12px] text-[var(--color-ink-muted)]">
                {latestStructured.tool_calls.map((tc) => (
                  <li key={tc.tool_call_id} className="truncate">
                    {tc.tool_name}
                    {tc.summary ? ` — ${tc.summary}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <div className="border-t border-[var(--color-border-subtle)] pt-3 text-[13px] text-[var(--color-ink-subtle)]">
          Metrics, citations, and linked records from your active investigation
          will appear here.
        </div>
      )}
    </aside>
  );
}
