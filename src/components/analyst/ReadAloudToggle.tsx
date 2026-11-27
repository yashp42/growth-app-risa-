import { Volume2, VolumeX } from 'lucide-react';

interface ReadAloudToggleProps {
  on: boolean;
  supported: boolean;
  onChange: (on: boolean) => void;
  compact?: boolean;
}

/** Speaker toggle: when on, each new answer is read aloud in the browser. */
export function ReadAloudToggle({ on, supported, onChange, compact = false }: ReadAloudToggleProps) {
  if (!supported) return null;
  const label = on ? 'Stop reading answers aloud' : 'Read new answers aloud';
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      aria-label={label}
      title={`${label} (English browser voice; tables are not read)`}
      className={
        compact
          ? `flex h-8 w-8 items-center justify-center rounded transition-colors duration-150 ${
              on
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]'
                : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]'
            }`
          : `inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
              on
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]'
                : 'border-[var(--color-border)] bg-white text-[var(--color-ink-muted)] hover:border-[var(--color-ink-subtle)] hover:text-[var(--color-ink)]'
            }`
      }
    >
      {on ? (
        <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {compact ? null : <span>{on ? 'Read aloud: on' : 'Read aloud: off'}</span>}
    </button>
  );
}
