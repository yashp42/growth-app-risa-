import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ORB_STATE_LABEL, type OrbState } from '../../lib/orbState';

/**
 * The analyst's single visual identity: a soft, glowing, blurred sphere.
 * Layered radial gradients + blur + screen blending, animated with `motion`.
 * Every state comes from a real event (see lib/orbState.ts). Animations use
 * transform/opacity only (plus the short answering blur-out), and
 * prefers-reduced-motion turns all motion off, leaving colour changes only.
 */

export interface AnalystOrbProps {
  state: OrbState;
  /** Live mic level 0..1 (local AnalyserNode) while listening. */
  level?: number;
  size?: number;
  /** Real tool steps for the thinking state, e.g. "Looking up M-01…". */
  statusText?: string | null;
  /** Interim speech transcript while listening. */
  transcript?: string | null;
  /** Show status and transcript text under the orb (centrepiece). */
  showCaption?: boolean;
  onActivate?: () => void;
  /** Space bar while focused toggles the mic. */
  onToggleMic?: () => void;
  ariaLabel?: string;
  className?: string;
  /** Render inside another control (e.g. the floating Ask button): no own button or handlers. */
  decorative?: boolean;
}

const RING_COLOR: Partial<Record<OrbState, string>> = {
  listening: 'rgba(92, 211, 230, 0.85)',
  confirm: 'rgba(224, 163, 58, 0.95)',
  error: 'rgba(196, 64, 52, 0.95)',
};

export function AnalystOrb({
  state,
  level = 0,
  size = 120,
  statusText,
  transcript,
  showCaption = false,
  onActivate,
  onToggleMic,
  ariaLabel = 'Growth Analyst',
  className = '',
  decorative = false,
}: AnalystOrbProps) {
  const reduce = useReducedMotion() ?? false;
  const [hover, setHover] = useState(false);
  const leanX = useMotionValue(0);
  const leanY = useMotionValue(0);
  const sx = useSpring(leanX, { stiffness: 120, damping: 14 });
  const sy = useSpring(leanY, { stiffness: 120, damping: 14 });

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    leanX.set(((e.clientX - r.left) / r.width - 0.5) * size * 0.08);
    leanY.set(((e.clientY - r.top) / r.height - 0.5) * size * 0.08);
  };
  const onPointerLeave = () => {
    setHover(false);
    leanX.set(0);
    leanY.set(0);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      onToggleMic?.();
    }
  };

  const listening = state === 'listening';
  const thinking = state === 'thinking';
  const answering = state === 'answering';
  const ring = RING_COLOR[state];

  // Core scale per state (transform only).
  const coreAnimate = reduce
    ? { scale: 1, opacity: 1 }
    : answering
      ? { scale: 0.82, opacity: 0, filter: 'blur(24px)' }
      : listening
        ? { scale: 1 + Math.min(1, level) * 0.18, opacity: 1, filter: 'blur(0px)' }
        : state === 'idle' || state === 'confirm'
          ? { scale: [0.98, 1.02, 0.98], opacity: 1, filter: 'blur(0px)' }
          : { scale: 1, opacity: 1, filter: 'blur(0px)' };
  const coreTransition = reduce
    ? { duration: 0 }
    : answering
      ? { duration: 0.45, ease: 'easeOut' as const }
      : listening
        ? { type: 'spring' as const, stiffness: 300, damping: 18 }
        : state === 'idle' || state === 'confirm'
          ? { duration: 4, repeat: Infinity, ease: 'easeInOut' as const }
          : { duration: 0.3 };

  const Wrapper = decorative ? 'span' : 'button';
  const wrapperProps = decorative
    ? { 'aria-hidden': true as const }
    : {
        type: 'button' as const,
        'aria-label': `${ariaLabel}: ${ORB_STATE_LABEL[state]}`,
        title: 'Ask or speak',
        onClick: onActivate,
        onKeyDown,
        onPointerEnter: () => setHover(true),
        onPointerMove,
        onPointerLeave,
      };

  const caption = listening
    ? transcript || 'Listening…'
    : thinking
      ? statusText || 'Working on it…'
      : state === 'confirm'
        ? 'Review the change card: Accept or Cancel'
        : state === 'error'
          ? statusText || 'Something went wrong'
          : 'Ask or speak';

  return (
    <span className={`inline-flex flex-col items-center ${className}`}>
      <Wrapper
        {...wrapperProps}
        data-orb-state={state}
        className="group relative block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#315F52] focus-visible:ring-offset-2"
        style={{ width: size, height: size }}
      >
        {/* Glow */}
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full"
          style={{
            inset: -size * 0.22,
            background:
              'radial-gradient(circle, rgba(49,95,82,0.55) 0%, rgba(139,124,246,0.25) 45%, rgba(92,211,230,0) 70%)',
            filter: `blur(${Math.round(size * 0.12)}px)`,
          }}
          animate={{ opacity: reduce ? 0.6 : hover || listening || thinking ? 0.95 : 0.55 }}
          transition={{ duration: reduce ? 0 : 0.3 }}
        />

        {/* Listening ripple */}
        {listening && !reduce ? (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full border-2"
            style={{ borderColor: RING_COLOR.listening }}
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 1.55, opacity: 0 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
          />
        ) : null}

        {/* Lean toward the cursor */}
        <motion.span className="absolute inset-0 block" style={{ x: sx, y: sy }}>
          <motion.span
            className="absolute inset-0 block overflow-hidden rounded-full"
            style={{
              background:
                'radial-gradient(circle at 32% 28%, #BFF3E2 0%, #4E9C85 30%, #315F52 58%, #1E3B32 100%)',
              boxShadow: ring
                ? `0 0 0 ${Math.max(2, size * 0.035)}px ${ring}`
                : 'inset 0 0 0 1px rgba(255,255,255,0.25)',
            }}
            animate={coreAnimate}
            transition={coreTransition}
          >
            {/* Violet + cyan highlights (screen blend), swirling while thinking */}
            <motion.span
              aria-hidden="true"
              className="absolute block rounded-full"
              style={{
                inset: '-20%',
                background:
                  'radial-gradient(circle at 30% 70%, rgba(139,124,246,0.85) 0%, rgba(139,124,246,0) 45%), radial-gradient(circle at 72% 35%, rgba(92,211,230,0.8) 0%, rgba(92,211,230,0) 42%)',
                filter: `blur(${Math.round(size * 0.1)}px)`,
                mixBlendMode: 'screen',
              }}
              animate={reduce ? { rotate: 0 } : { rotate: 360 }}
              transition={reduce ? { duration: 0 } : { duration: thinking ? 2.2 : 14, repeat: Infinity, ease: 'linear' }}
            />
            {/* Specular highlight */}
            <span
              aria-hidden="true"
              className="absolute block rounded-full"
              style={{
                width: '38%',
                height: '30%',
                left: '18%',
                top: '12%',
                background: 'radial-gradient(circle, rgba(255,255,255,0.75), rgba(255,255,255,0))',
                filter: `blur(${Math.max(1, Math.round(size * 0.04))}px)`,
              }}
            />
            {/* Error flicker */}
            {state === 'error' ? (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 block rounded-full bg-[#C44034]"
                initial={{ opacity: 0 }}
                animate={reduce ? { opacity: 0.45 } : { opacity: [0, 0.6, 0.15, 0.5, 0] }}
                transition={{ duration: reduce ? 0 : 0.9 }}
              />
            ) : null}
          </motion.span>

          {/* Orbiting particles while thinking */}
          {thinking && !reduce ? (
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 block"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
            >
              {[0, 120, 240].map((deg) => (
                <span
                  key={deg}
                  className="absolute block rounded-full bg-white/80"
                  style={{
                    width: Math.max(3, size * 0.05),
                    height: Math.max(3, size * 0.05),
                    left: '50%',
                    top: '50%',
                    transform: `rotate(${deg}deg) translate(${size * 0.62}px) translate(-50%, -50%)`,
                  }}
                />
              ))}
            </motion.span>
          ) : null}
        </motion.span>

        {/* Hover tooltip */}
        {hover && !showCaption ? (
          <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[#202824] px-2 py-0.5 text-[11px] text-white">
            Ask or speak
          </span>
        ) : null}
      </Wrapper>

      {showCaption ? (
        <span className="mt-4 block max-w-[28rem] min-h-[1.25rem] text-center text-[13px] text-[#525E58]">{caption}</span>
      ) : null}

      {decorative ? null : (
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {ORB_STATE_LABEL[state]}
        {thinking && statusText ? ` ${statusText}` : ''}
        {state === 'error' && statusText ? ` ${statusText}` : ''}
      </span>
      )}
    </span>
  );
}
