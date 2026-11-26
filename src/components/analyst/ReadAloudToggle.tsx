import { Volume2, VolumeX } from 'lucide-react';

interface ReadAloudToggleProps {
  on: boolean;
  supported: boolean;
  onChange: (on: boolean) => void;
  compact?: boolean;
}

/** Speaker toggle: when on, each new answer is read aloud in the browser (en-IN). */
export function ReadAloudToggle({ on, supported, onChange, compact = false }: ReadAloudToggleProps) {
  if (!supported) return null;
  const label = on ? 'Stop reading answers aloud' : 'Read new answers aloud';
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      aria-label={label}
      title={`${label} (browser voice, en-IN; tables are not read)`}
      className={
        compact
          ? `flex h-8 w-8 items-center justify-center rounded transition-colors duration-150 ${
              on
                ? 'bg-[#EBF1EE] text-[#264B40]'
                : 'text-[#525E58] hover:bg-[#FAF9F6] hover:text-[#202824]'
            }`
          : `inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              on
                ? 'border-[#315F52] bg-[#EBF1EE] text-[#264B40]'
                : 'border-[#D9D7D0] bg-white text-[#525E58] hover:border-[#788C83] hover:text-[#202824]'
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
