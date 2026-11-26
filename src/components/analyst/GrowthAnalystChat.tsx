import { AlertCircle, RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { AnalystApiError } from '../../services/analystApi';
import type {
  AiActionRecord,
  AiChatMessage,
  AiPermissionProfile,
  AiViewSpec,
} from '../../types/analyst';
import { ChatComposer } from './ChatComposer';
import { ChatMessage } from './ChatMessage';

const INVESTIGATION_STARTERS: ReadonlyArray<string> = [
  'What is our signed value vs the approved base target?',
  'Which campaign is leaking the most qualified leads?',
  'How much cash did we collect in 2025?',
  'Which signed partnerships still have outstanding cash?',
  'Which prospects should we pursue first?',
  'How much cash have we collected before fest?',
];

interface GrowthAnalystChatProps {
  messages: AiChatMessage[];
  actions: AiActionRecord[];
  permissionProfile: AiPermissionProfile;
  sending: boolean;
  loadingConversation: boolean;
  error: AnalystApiError | null;
  dataVersionChanged: boolean;
  actionProcessingId: string | null;
  actionErrorById: Record<string, string>;
  batchProcessingId?: string | null;
  batchErrorById?: Record<string, string>;
  initialDraft?: string | null;
  autoStartVoiceNonce?: number;
  toggleVoiceNonce?: number;
  voiceInputCommand?: {id:number;action:'start'|'stop'};
  onListeningChange?: (listening: boolean) => void;
  onInterimTranscript?: (text: string) => void;
  onSend: (
    message: string,
    options?: { fromVoice?: boolean }
  ) => Promise<void>;
  onDismissError: () => void;
  onClearDataVersionChanged: () => void;
  onRequestConfirmAction: (action: AiActionRecord) => void;
  onCancelAction: (actionId: string) => void;
  onConfirmBatch?: (batchId: string) => void;
  onCancelBatch?: (batchId: string) => void;
  onEditAction?: (action: AiActionRecord) => void;
  onActivateView?: (viewSpec: AiViewSpec) => void;
  onOpenRecord?: (recordType: string, recordId: string) => void;
  onSubmitFeedback?: (
    messageId: string,
    queryId: string,
    rating: 'up' | 'down'
  ) => Promise<void> | void;
  compact?: boolean;
}

export function GrowthAnalystChat({
  messages,
  actions,
  permissionProfile,
  sending,
  loadingConversation,
  error,
  dataVersionChanged,
  actionProcessingId,
  actionErrorById,
  batchProcessingId = null,
  batchErrorById = {},
  initialDraft,
  autoStartVoiceNonce = 0,
  toggleVoiceNonce,
  voiceInputCommand,
  onListeningChange,
  onInterimTranscript,
  onSend,
  onDismissError,
  onClearDataVersionChanged,
  onRequestConfirmAction,
  onCancelAction,
  onConfirmBatch,
  onCancelBatch,
  onEditAction,
  onActivateView,
  onOpenRecord,
  onSubmitFeedback,
  compact = false,
}: GrowthAnalystChatProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const actionsById = actions.reduce<Record<string, AiActionRecord>>(
    (acc, item) => {
      acc[item.ai_action_id] = item;
      return acc;
    },
    {}
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth', block: 'end' });
  }, [messages.length, sending, error]);

  return (
    <div className="flex min-h-[460px] flex-col justify-between gap-4">
      <div className="space-y-4">
        {dataVersionChanged ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3.5 py-2.5 text-[13px] text-[var(--color-ink)]">
            <div className="flex items-center gap-2">
              <RefreshCw
                className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]"
                aria-hidden="true"
              />
              <span>
                Underlying sponsorship data has updated since the previous turn.
                Follow-up questions will retrieve fresh figures.
              </span>
            </div>
            <button
              type="button"
              onClick={onClearDataVersionChanged}
              className="shrink-0 text-[12px] font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {loadingConversation ? (
          <div className="space-y-3" aria-busy="true">
            <div className="h-16 animate-pulse rounded-md border border-[var(--color-border)] bg-white" />
            <div className="h-28 animate-pulse rounded-md border border-[var(--color-border)] bg-white" />
          </div>
        ) : messages.length === 0 ? (
          <div className="py-6 sm:py-10">
            <h2 className="text-[24px] font-semibold text-[var(--color-ink)]">
              What would you like to explore?
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {INVESTIGATION_STARTERS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={sending}
                  onClick={() => void onSend(prompt)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-white px-4 py-3 text-left text-[14px] text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-subtle)] disabled:opacity-50"
                >
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.message_id}
                message={msg}
                actionsById={actionsById}
                permissionProfile={permissionProfile}
                actionProcessingId={actionProcessingId}
                actionErrorById={actionErrorById}
                batchProcessingId={batchProcessingId}
                batchErrorById={batchErrorById}
                onSelectFollowUp={(q) => void onSend(q)}
                onRequestConfirmAction={onRequestConfirmAction}
                onCancelAction={onCancelAction}
                onConfirmBatch={onConfirmBatch}
                onCancelBatch={onCancelBatch}
                onEditAction={onEditAction}
                onActivateView={onActivateView}
                onOpenRecord={onOpenRecord}
                onSubmitFeedback={onSubmitFeedback}
                compact={compact}
              />
            ))}
          </div>
        )}

        {sending ? (
          <div
            aria-live="polite"
            className="rounded-md border border-[var(--color-border)] bg-white px-4 py-3 text-[14px] text-[var(--color-ink-muted)]"
          >
            Retrieving current metrics and source evidence...
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-[var(--color-border)] bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#9B3B32]"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-[14px] font-semibold text-[var(--color-ink)]">
                    {error.status === 403
                      ? 'Permission restricted'
                      : 'Growth Analyst service unavailable'}
                  </p>
                  <div className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
                    {error.status===429?'The analyst has reached its temporary request limit. Try again after the limit resets; the rest of your workspace remains available.':'We could not complete that request. You can retry without leaving this conversation.'}<details className="source-details"><summary>Diagnostic details</summary><p className="mt-2 break-words font-mono text-xs">{error.message}</p></details>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onDismissError}
                className="shrink-0 text-[13px] font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 z-10 bg-[var(--color-canvas)]/95 pb-3 pt-4">
        <ChatComposer
          onSend={onSend}
          sending={sending}
          disabled={
            permissionProfile.verifiedByServer && !permissionProfile.canUseAnalyst
          }
          initialDraft={initialDraft}
          autoStartVoiceNonce={autoStartVoiceNonce}
          toggleVoiceNonce={toggleVoiceNonce}
          voiceInputCommand={voiceInputCommand}
          onListeningChange={onListeningChange}
          onInterimTranscript={onInterimTranscript}
          compact={compact}
        />
      </div>
    </div>
  );
}


