/**
 * Browser-only read-aloud helpers (speechSynthesis, en-IN). Nothing here talks
 * to the server; tables and code blocks are never read out.
 */

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Answer text only: drops markdown tables, code blocks and formatting marks. */
export function answerTextForSpeech(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const kept: string[] = [];
  let inCode = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (/^\|.*\|$/.test(trimmed) || /^\|?[\s:-]+\|[\s|:-]*$/.test(trimmed)) {
      continue;
    }
    if (trimmed) {
      kept.push(trimmed.replace(/[*_`#]+/g, ''));
    }
  }
  return kept
    .map((line, i) => (i < kept.length - 1 && !/[.!?:;]$/.test(line) ? `${line}.` : line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Speak text in en-IN, replacing anything currently being read. */
export function speakAnswer(
  raw: string,
  handlers: { onEnd?: () => void } = {}
): boolean {
  if (!isSpeechSynthesisSupported()) return false;
  const text = answerTextForSpeech(raw);
  if (!text) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-IN';
  utterance.onend = () => handlers.onEnd?.();
  utterance.onerror = () => handlers.onEnd?.();
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}

const AUTO_READ_STORAGE_KEY = 'growth_analyst_auto_read_v1';

export function loadAutoReadPreference(): boolean {
  try {
    return window.localStorage.getItem(AUTO_READ_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveAutoReadPreference(on: boolean): void {
  try {
    window.localStorage.setItem(AUTO_READ_STORAGE_KEY, on ? '1' : '0');
  } catch {
    // Storage unavailable (private window): the toggle still works this session.
  }
}
