import { useState } from 'react';
import type { ImportDestination } from '../../lib/csvImport';
import { DataImportPanel } from './DataImportPanel';

/** A discoverable, destination-specific entry point for imports in work areas. */
export function ContextualImport({
  destination,
  label,
  onImported,
}: {
  destination: ImportDestination;
  label: string;
  onImported?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mb-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Import {label}</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Upload CSV or Excel data directly into this workspace.</p>
        </div>
        <button type="button" className="button-secondary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {open ? 'Close import' : `Import ${label}`}
        </button>
      </div>
      {open ? <div className="mt-4"><DataImportPanel initialDestination={destination} compact onImported={onImported} /></div> : null}
    </section>
  );
}
