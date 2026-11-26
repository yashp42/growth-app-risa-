import { ArrowLeft } from 'lucide-react';
import { findNavItem } from '../../services/overviewApi';
import type { NavSectionId } from '../../types/overview';

interface ModulePlaceholderViewProps {
  sectionId: Exclude<NavSectionId, 'overview'>;
  analystPromptContext: string | null;
  onReturnToOverview: () => void;
}

export function ModulePlaceholderView({
  sectionId,
  analystPromptContext,
  onReturnToOverview,
}: ModulePlaceholderViewProps) {
  const navItem = findNavItem(sectionId);
  const isAnalyst = sectionId === 'growth-analyst';

  return (
    <div className="space-y-6 pb-8">
      <div className="border-b border-[var(--color-border)] pb-5">
        <p className="font-mono text-[12px] text-[var(--color-ink-subtle)]">
          {navItem.groupLabel}
        </p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.025em] text-[var(--color-ink)]">
          {navItem.label}
        </h1>
      </div>

      <div className="rounded-md border border-[var(--color-border)] bg-white p-6">
        {isAnalyst && analystPromptContext ? (
          <div className="mb-5 rounded border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)]/40 p-4">
            <p className="font-mono text-[12px] text-[var(--color-accent)]">
              Selected inquiry
            </p>
            <p className="mt-1 text-[14px] font-medium text-[var(--color-ink)]">
              {analystPromptContext}
            </p>
          </div>
        ) : null}

        <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">
          Scheduled for a future build
        </h2>
        <p className="mt-1 text-[14px] text-[var(--color-ink-muted)]">
          {navItem.label} is not yet active in this workspace.
        </p>

        <div className="mt-5">
          <button
            type="button"
            onClick={onReturnToOverview}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--color-border)] bg-white px-3.5 text-[14px] font-medium text-[var(--color-ink)] transition-colors duration-150 hover:bg-[var(--color-surface-subtle)]"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-[var(--color-ink-muted)]" aria-hidden="true" />
            Return to Growth overview
          </button>
        </div>
      </div>
    </div>
  );
}
