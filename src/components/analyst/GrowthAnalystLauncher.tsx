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
    <div className="fixed right-5 bottom-5 z-40 flex items-center gap-1.5 rounded-full border border-[#264B40] bg-[#315F52] p-1 text-white shadow-md sm:right-6 sm:bottom-6">
      <button
        type="button"
        onClick={onClick}
        aria-label="Ask Growth Analyst"
        className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-white transition-colors duration-150 hover:bg-[#264B40] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <AnalystOrb state={orbState} size={22} decorative />
        <span>Ask</span>
      </button>

      {onVoiceClick ? (
        <button
          type="button"
          onClick={onVoiceClick}
          aria-label="Ask Growth Analyst by voice"
          title="Ask by voice (en-IN)"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#264B40] text-white transition-colors duration-150 hover:bg-[#1E3B32] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Mic className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
