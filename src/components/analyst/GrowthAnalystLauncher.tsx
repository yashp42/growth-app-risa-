import { Mic } from 'lucide-react';
import type { OrbState } from '../../lib/orbState';
import { AnalystOrb } from './AnalystOrb';

interface GrowthAnalystLauncherProps {
  visible: boolean;
  onClick: () => void;
  onVoiceClick?: () => void;
  orbState?: OrbState;
}

export function GrowthAnalystLauncher({
  visible,
  onClick,
  onVoiceClick,
  orbState = 'idle',
}: GrowthAnalystLauncherProps) {
  if (!visible) return null;

  return (
    <div className="fixed right-5 bottom-5 z-40 flex items-center gap-1.5 rounded-full border border-[var(--color-accent-hover)] bg-[var(--color-accent)] p-1 text-white shadow-md sm:right-6 sm:bottom-6">
      <button
        type="button"
        onClick={onClick}
        aria-label="Ask Growth Analyst"
        className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-[var(--color-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <AnalystOrb state={orbState} size={22} decorative />
        <span>Ask Analyst</span>
      </button>

      {onVoiceClick ? (
        <button
          type="button"
          onClick={onVoiceClick}
          aria-label="Ask Growth Analyst by voice"
          title="Ask by voice (en-IN)"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent-hover)] text-white transition-colors duration-150 hover:bg-[#1E3B32] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Mic className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

