import { useMicLevel } from '../../hooks/useMicLevel';
import type { OrbState } from '../../lib/orbState';
import { AnalystOrb } from './AnalystOrb';

interface OrbStageProps {
  state: OrbState;
  micOn: boolean;
  steps: string[];
  transcript: string;
  errorText?: string | null;
  onToggleMic: () => void;
  onActivate: () => void;
  compact?: boolean;
}

/** Centrepiece of the Growth Analyst screen: the orb on a frosted-glass panel. */
export function OrbStage({
  state,
  micOn,
  steps,
  transcript,
  errorText,
  onToggleMic,
  onActivate,
  compact = false,
}: OrbStageProps) {
  const level = useMicLevel(micOn);
  const latestStep = steps.length > 0 ? steps[steps.length - 1] : null;
  return (
    <div
      className="relative mb-4 flex flex-col items-center overflow-hidden rounded-xl border border-white/60 px-4 py-6"
      style={{
        background:
          'linear-gradient(135deg, rgba(235,241,238,0.75), rgba(244,240,255,0.6) 55%, rgba(232,248,251,0.6))',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.55), 0 1px 2px rgba(32,40,36,0.06)',
      }}
    >
      <AnalystOrb
        state={state}
        level={level}
        size={compact ? 72 : 104}
        statusText={state === 'error' ? errorText ?? null : latestStep}
        transcript={transcript}
        showCaption
        onToggleMic={onToggleMic}
        onActivate={onActivate}
      />
      {state === 'thinking' && steps.length > 1 ? (
        <ol className="mt-2 space-y-0.5 text-center text-[11px] text-[#788C83]" aria-label="Steps so far">
          {steps.slice(0, -1).map((s, i) => (
            <li key={`${s}-${i}`}>✓ {s}</li>
          ))}
        </ol>
      ) : null}
      <p className="mt-2 text-[11px] text-[#788C83]">Click to type · focus and press Space to talk</p>
    </div>
  );
}
