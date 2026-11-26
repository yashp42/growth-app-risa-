import { attentionTitle, businessText } from '../../lib/businessCopy';
import { ArrowUpRight, ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ATTENTION_CATEGORY_OPTIONS } from '../../services/overviewApi';
import type {
  ApiErrorInfo,
  AttentionCategory,
  DataLoadStatus,
  NeedsAttentionItem,
} from '../../types/overview';
import { DataStateWrapper } from '../ui/DataStateWrapper';
import { SectionHeader } from '../ui/SectionHeader';

interface NeedsAttentionQueueSectionProps {
  items: NeedsAttentionItem[];
  status: DataLoadStatus;
  error: ApiErrorInfo | null;
  onRetry: () => void;
  onInspectItem?: (item: NeedsAttentionItem | null) => void;
}

export function NeedsAttentionQueueSection({
  items,
  status,
  error,
  onRetry,
  onInspectItem,
}: NeedsAttentionQueueSectionProps) {
  const [selectedCategory, setSelectedCategory] =
    useState<AttentionCategory>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'all') return items;
    return items.filter((item) => item.category === selectedCategory);
  }, [items, selectedCategory]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const skeleton = (
    <div className="rounded-md border border-[var(--color-border)] bg-white divide-y divide-[var(--color-border-subtle)]">
      {[0, 1, 2].map((idx) => (
        <div key={idx} className="px-5 py-4">
          <div className="h-4 w-56 rounded bg-[var(--color-border-subtle)]" />
          <div className="mt-2 h-3 w-80 rounded bg-[var(--color-canvas)]" />
        </div>
      ))}
    </div>
  );

  return (
    <section
      id="section-attention"
      aria-label="Needs attention queue"
      className="space-y-4"
    >
      <SectionHeader
        title="Needs attention"
        meta={items.length > 0 ? `${filteredItems.length} items` : undefined}
      />

      {/* Category filter bar */}
      <div
        role="tablist"
        aria-label="Filter attention queue by category"
        className="flex flex-wrap items-center gap-1.5"
      >
        {ATTENTION_CATEGORY_OPTIONS.map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelectedCategory(cat.id)}
              className={`rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 whitespace-nowrap ${
                isActive
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                  : 'border-[var(--color-border)] bg-white text-[var(--color-ink-muted)] hover:border-[var(--color-ink-subtle)] hover:text-[var(--color-ink)]'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      <DataStateWrapper
        status={status}
        error={error}
        onRetry={onRetry}
        loadingSkeleton={skeleton}
      >
        <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-white">
          {filteredItems.length > 0 ? (
            <ul className="divide-y divide-[var(--color-border-subtle)]">
              {filteredItems.map((item) => {
                const isExpanded = Boolean(expandedIds[item.id]);
                return (
                  <li key={item.id} className="bg-white">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => toggleExpand(item.id)}
                      className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors duration-150 hover:bg-[var(--color-surface-subtle)]"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        {isExpanded ? (
                          <ChevronDown
                            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]"
                            aria-hidden="true"
                          />
                        ) : (
                          <ChevronRight
                            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-subtle)]"
                            aria-hidden="true"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-[var(--color-ink-subtle)]">
                            <span className="font-medium text-[var(--color-accent)]">
                              {item.categoryLabel === 'Threshold rule' ? 'Performance alert' : item.categoryLabel}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{item.responsibleOwner}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[12px] tabular-nums">
                              {item.timestampLabel}
                            </span>
                          </div>
                          <p className="mt-1 text-[14px] font-semibold text-[var(--color-ink)]">
                            {attentionTitle(item.title)}
                          </p>
                          <p className="mt-0.5 text-[14px] text-[var(--color-ink-muted)]">
                            {businessText(item.whatHappened)}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[12px] text-[var(--color-ink-subtle)]">
                        {isExpanded ? 'Hide' : 'Details'}
                      </span>
                    </button>

                    {isExpanded ? (
                      <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-5 py-4 pl-12">
                        <p className="mb-3 text-sm text-[var(--color-ink-muted)]">{item.title}</p>
                        <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <dt className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                              Why it matters
                            </dt>
                            <dd className="mt-1 text-[14px] text-[var(--color-ink)]">
                              {item.whyItMatters}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                              Evidence
                            </dt>
                            <dd className="mt-1 text-[14px] text-[var(--color-ink)]">
                              {item.relevantEvidence}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[12px] font-medium text-[var(--color-ink-subtle)]">
                              Next step
                            </dt>
                            <dd className="mt-1 text-[14px] font-medium text-[var(--color-accent)]">
                              {item.recommendedNextStep}
                            </dd>
                          </div>
                          <div className="flex items-end justify-start md:justify-end">
                            <button
                              type="button"
                              onClick={() => onInspectItem?.(item)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-[13px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-canvas)]"
                            >
                              Open record
                              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </dl>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-[14px] font-medium text-[var(--color-ink)]">
                {selectedCategory === 'all'
                  ? 'No items need attention'
                  : `No ${
                      ATTENTION_CATEGORY_OPTIONS.find(
                        (c) => c.id === selectedCategory
                      )?.label.toLowerCase() ?? 'items'
                    }`}
              </p>
              {selectedCategory !== 'all' ? (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className="mt-2.5 text-[13px] font-medium text-[var(--color-accent)] hover:underline"
                >
                  Show all categories
                </button>
              ) : null}
            </div>
          )}
        </div>
      </DataStateWrapper>
    </section>
  );
}

