/**
 * Analyst orb state, derived only from real events (mic on, request in flight,
 * a pending change card, an error, an answer arriving). No timers drive a
 * state on their own: the two short transitions (answering, error flicker)
 * start at a real event and simply end after their animation.
 */

export type OrbState = 'idle' | 'listening' | 'thinking' | 'answering' | 'confirm' | 'error';

export const ANSWERING_MS = 450;
export const ERROR_FLASH_MS = 900;

export interface OrbInputs {
  micOn: boolean;
  sending: boolean;
  pendingConfirm: boolean;
  /** Timestamp (ms) of the last error or quota-out, if any. */
  lastErrorAt: number | null;
  /** Timestamp (ms) the last answer arrived, if any. */
  lastAnsweredAt: number | null;
  now: number;
}

export function deriveOrbState(i: OrbInputs): OrbState {
  if (i.lastErrorAt !== null && i.now - i.lastErrorAt < ERROR_FLASH_MS) return 'error';
  if (i.micOn) return 'listening';
  if (i.sending) return 'thinking';
  if (i.lastAnsweredAt !== null && i.now - i.lastAnsweredAt < ANSWERING_MS) return 'answering';
  if (i.pendingConfirm) return 'confirm';
  return 'idle';
}

export const ORB_STATE_LABEL: Record<OrbState, string> = {
  idle: 'Growth Analyst ready. Ask or speak.',
  listening: 'Listening…',
  thinking: 'Working on it…',
  answering: 'Answer ready.',
  confirm: 'A change is waiting for your Accept or Cancel.',
  error: 'Something went wrong.',
};
