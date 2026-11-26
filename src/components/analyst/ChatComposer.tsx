import { stopSpeaking } from '../../lib/speech';
import { ArrowUp, Mic, MicOff } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
}

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: BrowserSpeechRecognitionAlternative;
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: BrowserSpeechRecognitionResult;
  };
}

interface BrowserSpeechRecognitionErrorEvent {
  error?: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

const SILENCE_AUTO_SEND_MS = 1500;

interface ChatComposerProps {
  onSend: (
    message: string,
    options?: { fromVoice?: boolean }
  ) => Promise<void> | void;
  disabled?: boolean;
  sending?: boolean;
  initialDraft?: string | null;
  placeholder?: string;
  compact?: boolean;
  autoStartVoiceNonce?: number;
  /** Incremented by the orb (space bar) to toggle the mic. */
  toggleVoiceNonce?: number;
  voiceInputCommand?: {id:number;action:'start'|'stop'};
  /** Real mic on/off, for the orb's listening state. */
  onListeningChange?: (listening: boolean) => void;
  /** Interim transcript, shown under the orb while listening. */
  onInterimTranscript?: (text: string) => void;
}

export function ChatComposer({
  onSend,
  disabled = false,
  sending = false,
  initialDraft,
  placeholder = 'Ask about funnel leaks, metrics, D-010 strategy, or propose a follow-up task...',
  compact = false,
  autoStartVoiceNonce = 0,
  toggleVoiceNonce = 0,
  voiceInputCommand,
  onListeningChange,
  onInterimTranscript,
}: ChatComposerProps) {
  const [draft, setDraft] = useState(initialDraft ?? '');
  const [interimText, setInterimText] = useState('');
  const [listening, setListening] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [autoSendSilence, setAutoSendSilence] = useState(true);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const baseDraftRef = useRef('');
  const finalBufferRef = useRef('');
  const latestSpokenRef = useRef('');
  const silenceTimerRef = useRef<number | null>(null);
  const autoSendSilenceRef = useRef(autoSendSilence);
  autoSendSilenceRef.current = autoSendSilence;
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;
  const lastAutoVoiceNonceRef = useRef(0);

  const speechSupported = getSpeechRecognitionCtor() !== null;
  const voiceAvailable = speechSupported && !micDenied;

  useEffect(() => {
    if (initialDraft && initialDraft.trim()) {
      setDraft(initialDraft);
    }
  }, [initialDraft]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopRecognition = useCallback(
    (abort = false) => {
      clearSilenceTimer();
      const rec = recognitionRef.current;
      if (rec) {
        // Keep an unfinished utterance available in chat when pausing or exiting voice.
        if(latestSpokenRef.current.trim())setDraft(latestSpokenRef.current.trim());
        recognitionRef.current = null;
        try {
          if (abort) rec.abort();
          else rec.stop();
        } catch {
          // Ignore stop/abort errors if already ended
        }
      }
      setListening(false);
      setInterimText('');
    },
    [clearSilenceTimer]
  );

  useEffect(() => {
    return () => {
      stopRecognition(true);
    };
  }, [stopRecognition]);

  const startVoice = useCallback(() => {
    setVoiceError(null);
    if (recognitionRef.current || listening || disabled || sending) return;

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      return;
    }

    try {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-IN';

      baseDraftRef.current = draft.trim();
      finalBufferRef.current = '';
      latestSpokenRef.current = draft.trim();

      rec.onstart=()=>{if(recognitionRef.current===rec)setListening(true);};
      rec.onresult = (event) => {
        if(recognitionRef.current!==rec)return;
        let interim = '';
        let appendedFinal = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result?.[0]?.transcript ?? '';
          if (result?.isFinal) {
            appendedFinal += `${text} `;
          } else {
            interim += text;
          }
        }
        if (appendedFinal) {
          finalBufferRef.current =
            `${finalBufferRef.current} ${appendedFinal}`.trim();
          const combined = [baseDraftRef.current, finalBufferRef.current]
            .filter(Boolean)
            .join(' ');
          setDraft(combined);
          latestSpokenRef.current = combined;
        }
        const trimmedInterim = interim.trim();
        setInterimText(trimmedInterim);
        const liveCombined = [
          baseDraftRef.current,
          finalBufferRef.current,
          trimmedInterim,
        ]
          .filter(Boolean)
          .join(' ')
          .trim();
        if (liveCombined) {
          latestSpokenRef.current = liveCombined;
        }

        clearSilenceTimer();
        if (autoSendSilenceRef.current && liveCombined) {
          silenceTimerRef.current = window.setTimeout(() => {
            silenceTimerRef.current = null;
            const spoken = latestSpokenRef.current.trim();
            stopRecognition(false);
            if (spoken) {
              setDraft('');
              setInterimText('');
              setVoiceError(null);
              void onSendRef.current(spoken, { fromVoice: true });
            }
          }, SILENCE_AUTO_SEND_MS);
        }
      };

      rec.onerror = (event) => {
        if(recognitionRef.current!==rec)return;
        clearSilenceTimer();
        const code = event?.error ?? '';
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setMicDenied(true);
          setVoiceError('Voice needs Chrome or Edge and microphone permission');
        } else if (code === 'no-speech') {
          setVoiceError('No speech detected.');
        } else if (code && code !== 'aborted') {
          setVoiceError(`Voice input error (${code}).`);
        }
        recognitionRef.current = null;
        setListening(false);
        setInterimText('');
      };

      rec.onend = () => {
        if(recognitionRef.current!==rec)return;
        clearSilenceTimer();
        recognitionRef.current = null;
        setListening(false);
        setInterimText('');
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      clearSilenceTimer();
      recognitionRef.current = null;
      setListening(false);
      setVoiceError('Voice needs Chrome or Edge and microphone permission');
    }
  }, [clearSilenceTimer, disabled, draft, listening, sending, stopRecognition]);

  useEffect(() => {
    if (
      autoStartVoiceNonce > 0 &&
      autoStartVoiceNonce !== lastAutoVoiceNonceRef.current
    ) {
      lastAutoVoiceNonceRef.current = autoStartVoiceNonce;
      if (voiceAvailable && !listening && !disabled && !sending) {
        stopSpeaking();
    startVoice();
      }
    }
  }, [
    autoStartVoiceNonce,
    disabled,
    listening,
    sending,
    startVoice,
    voiceAvailable,
  ]);

  const toggleVoice = () => {
    if (listening) {
      stopRecognition(false);
      return;
    }
    startVoice();
  };

  // Report real mic state and interim transcript to the orb.
  const onListeningChangeRef = useRef(onListeningChange);
  onListeningChangeRef.current = onListeningChange;
  const onInterimRef = useRef(onInterimTranscript);
  onInterimRef.current = onInterimTranscript;
  useEffect(() => {
    onListeningChangeRef.current?.(listening);
  }, [listening]);
  useEffect(() => {
    onInterimRef.current?.(listening ? [draft,interimText].filter(Boolean).join(' ') : '');
  }, [interimText, listening, draft]);
  useEffect(
    () => () => {
      onListeningChangeRef.current?.(false);
      onInterimRef.current?.('');
    },
    []
  );

  const lastToggleNonceRef = useRef(toggleVoiceNonce);
  const toggleVoiceRef = useRef(toggleVoice);
  toggleVoiceRef.current = toggleVoice;
  useEffect(() => {
    if (toggleVoiceNonce !== lastToggleNonceRef.current) {
      lastToggleNonceRef.current = toggleVoiceNonce;
      if (voiceAvailable && !disabled && !sending) toggleVoiceRef.current();
    }
  }, [toggleVoiceNonce, voiceAvailable, disabled, sending]);

  const startVoiceRef=useRef(startVoice);startVoiceRef.current=startVoice;
  const lastCommandRef=useRef(0);
  useEffect(()=>{
    if(!voiceInputCommand||voiceInputCommand.id===lastCommandRef.current)return;
    lastCommandRef.current=voiceInputCommand.id;
    if(voiceInputCommand.action==='stop')stopRecognition(true);
    else if(speechSupported){setMicDenied(false);startVoiceRef.current();}
  },[voiceInputCommand,speechSupported,stopRecognition]);
  useEffect(()=>{if(sending||disabled)stopRecognition(true);},[sending,disabled,stopRecognition]);
  useEffect(()=>{window.dispatchEvent(new CustomEvent('analyst:voice-error',{detail:voiceError}));},[voiceError]);
  const displayValue = interimText
    ? `${draft}${draft && !draft.endsWith(' ') ? ' ' : ''}${interimText}`
    : draft;

  const canSubmit = draft.trim().length > 0 && !disabled && !sending;

  const submit = async (fromVoice = false) => {
    if (!canSubmit) return;
    if (listening) {
      stopRecognition(false);
    }
    const text = draft.trim();
    setDraft('');
    setInterimText('');
    setVoiceError(null);
    await onSend(text, { fromVoice });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
      className="analyst-composer p-3 focus-within:border-[var(--color-accent)]"
    >
      <div className="flex items-end gap-2">
        <textarea
          rows={2}
          value={displayValue}
          disabled={disabled || sending}
          onChange={(e) => {
            setInterimText('');
            setDraft(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Growth Analyst question"
          className="max-h-36 min-h-[44px] w-full resize-none bg-transparent px-1.5 py-1 text-[14px] leading-relaxed text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />

        {voiceAvailable ? (
          <button
            type="button"
            onClick={toggleVoice}
            disabled={disabled || sending}
            aria-label={
              listening ? 'Stop voice dictation' : 'Start voice dictation'
            }
            aria-pressed={listening}
            title={
              listening
                ? 'Stop listening'
                : 'Dictate via browser Web Speech (en-IN)'
            }
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors ${
              listening
                ? 'border-[#9B3B32] bg-[#FDF5F4] text-[#9B3B32]'
                : 'border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-[var(--color-ink-muted)] hover:border-[var(--color-ink-subtle)] hover:text-[var(--color-ink)]'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {listening ? (
              <MicOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Mic className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          aria-label="Send message"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--color-border-subtle)] disabled:text-[var(--color-ink-subtle)]"
        >
          <span>{sending ? 'Sending...' : 'Send'}</span>
          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 px-1.5 text-[12px]">
        {!voiceAvailable ? (
          <span className="text-[var(--color-ink-subtle)]">
            Voice needs Chrome or Edge and microphone permission
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-[var(--color-ink-subtle)]">
            <span>
              {listening
                ? 'Listening (en-IN)...'
                : !compact
                  ? 'Enter to send · Shift+Enter for new line'
                  : 'Browser voice (en-IN)'}
            </span>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[var(--color-ink-muted)]">
              <input
                type="checkbox"
                checked={autoSendSilence}
                onChange={(e) => setAutoSendSilence(e.target.checked)}
                className="h-3 w-3 accent-[var(--color-accent)]"
              />
              <span>Send after a pause</span>
            </label>
          </div>
        )}
        {voiceError && voiceAvailable ? (
          <span className="text-[#9B3B32]">{voiceError}</span>
        ) : null}
      </div>
    </form>
  );
}


