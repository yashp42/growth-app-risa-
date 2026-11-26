import type { ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  description?: string;
  meta?: string;
  action?: ReactNode;
}

export function SectionHeader({ title, description, meta, action }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-[var(--color-ink)]">
            {title}
          </h2>
          {meta ? (
            <details className="relative text-[12px] text-[var(--color-ink-subtle)]"><summary aria-label={`Details for ${title}`} className="list-none cursor-pointer rounded px-1.5 py-0.5 hover:bg-[var(--color-surface-subtle)]">Details</summary><div className="absolute left-0 top-full z-20 mt-2 min-w-48 rounded-lg border bg-white p-3 shadow-lg">{meta}</div></details>
          ) : null}
        </div>
        {description ? (
          <p className="mt-1 text-[14px] leading-relaxed text-[var(--color-ink-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

