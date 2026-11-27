/**
 * Browser-only read-aloud helpers (speechSynthesis, en-IN). Nothing here talks
 * to the server; tables and code blocks are never read out.
 */

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Answer text only: drops markdown tables, code blocks and formatting marks. */
export function answerTextForSpeech(raw: string): string {
  const lines = raw.replace(/(?:^|\n)Source notes:\s*\n[\s\S]*$/i, '').split(/\r?\n/);
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

export const SPEECH_ACTIVITY_EVENT = 'analyst:speech-activity';
let activeUtterance:SpeechSynthesisUtterance|null=null;
let finishActive:(()=>void)|null=null;
function reportSpeech(speaking:boolean){if(typeof window!=='undefined' && typeof window.dispatchEvent==='function')window.dispatchEvent(new CustomEvent(SPEECH_ACTIVITY_EVENT,{detail:{speaking}}));}
/** Speak text in en-IN, replacing anything currently being read. */
export function speakAnswer(
  raw: string,
  handlers: { onEnd?: () => void; onStart?: () => void } = {}
): boolean {
  if (!isSpeechSynthesisSupported()) return false;
  const text = answerTextForSpeech(raw);
  if (!text) return false;
  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-IN';
  activeUtterance=utterance;
  let finished=false;
  const finish=()=>{if(finished)return;finished=true;if(activeUtterance===utterance){activeUtterance=null;finishActive=null;reportSpeech(false);}handlers.onEnd?.();};
  finishActive=finish;
  utterance.onstart=()=>{if(activeUtterance===utterance){reportSpeech(true);handlers.onStart?.();}};
  utterance.onend=finish;
  utterance.onerror=()=>{if(activeUtterance===utterance && typeof window.dispatchEvent==='function')window.dispatchEvent(new CustomEvent('analyst:voice-error',{detail:'Speech playback is unavailable. You can continue in the conversation.'}));finish();};
  try{window.speechSynthesis.speak(utterance);return true;}catch{utterance.onerror?.(new Event('error') as SpeechSynthesisErrorEvent);return false;}
}

export function stopSpeaking(): void {
 const finish=finishActive;
 activeUtterance=null;finishActive=null;
 if(isSpeechSynthesisSupported())window.speechSynthesis.cancel();
 finish?.();reportSpeech(false);
}

/** Pause/resume the current browser utterance without replaying conversation history. */
export function pauseSpeaking(): boolean {
 if(!activeUtterance||!isSpeechSynthesisSupported())return false;
 try{window.speechSynthesis.pause();reportSpeech(false);return true;}catch{return false;}
}
export function resumeSpeaking(): boolean {
 if(!activeUtterance||!isSpeechSynthesisSupported())return false;
 try{window.speechSynthesis.resume();reportSpeech(true);return true;}catch{return false;}
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
