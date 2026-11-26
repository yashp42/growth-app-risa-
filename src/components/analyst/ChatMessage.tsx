import {
  AlertTriangle,
  LayoutGrid,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  isSpeechSynthesisSupported,
  speakAnswer,
  stopSpeaking,
} from '../../lib/speech';
import { AnswerBlocks } from './AnswerBlocks';
import { MarkdownAnswer } from './MarkdownAnswer';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import {
  formatRecordClassLabel,
  verifyAnalystResponseIntegrity,
} from '../../services/analystApi';
import type {
  AiActionRecord,
  AiChatMessage,
  AiPermissionProfile,
  AiViewSpec,
} from '../../types/analyst';
import { ProposedBatchCard } from './ProposedActionCard';

interface ChatMessageProps {
  message: AiChatMessage;
  actionsById: Record<string, AiActionRecord>;
  permissionProfile: AiPermissionProfile;
  actionProcessingId: string | null;
  actionErrorById: Record<string, string>;
  batchProcessingId?: string | null;
  batchErrorById?: Record<string, string>;
  onSelectFollowUp?: (question: string) => void;
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

export function ChatMessage({
  message,
  actionsById,
  permissionProfile,
  actionProcessingId,
  actionErrorById,
  batchProcessingId = null,
  batchErrorById = {},
  onSelectFollowUp,
  onRequestConfirmAction,
  onCancelAction,
  onConfirmBatch,
  onCancelBatch,
  onEditAction,
  onActivateView,
  onOpenRecord,
  onSubmitFeedback,
  compact = false,
}: ChatMessageProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [speaking, setSpeaking] = useState(false);

  const ttsSupported = isSpeechSynthesisSupported();

  useEffect(() => () => stopSpeaking(), []);

  const toggleSpeak = () => {
    if (!ttsSupported) return;
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    if (speakAnswer(message.content, { onEnd: () => setSpeaking(false) })) {
      setSpeaking(true);
    }
  };

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[90%] rounded-2xl rounded-br-sm bg-[var(--color-accent-soft)] px-5 py-3.5 text-[15px] leading-relaxed text-[var(--color-ink)]">
          <p className="whitespace-pre-wrap">{message.content}</p>
          {message.context_snapshot ? (
            <p className="sr-only">
              {formatRecordClassLabel(message.context_snapshot.record_class)} ·{' '}
              {message.context_snapshot.edition_id} · As of{' '}
              {message.context_snapshot.as_of}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const structured = message.structured;
  const integrity = structured
    ? verifyAnalystResponseIntegrity(structured)
    : null;
  const resolvedActions = (structured?.action_ids ?? [])
    .map((id) => actionsById[id])
    .filter((a): a is AiActionRecord => Boolean(a));

  const displayActions =
    resolvedActions.length > 0
      ? resolvedActions
      : (structured?.actions ?? []).map(
          (a) => actionsById[a.ai_action_id] ?? a
        );

  const groupedActionCards: Array<{ key: string; batchId: string | null; items: AiActionRecord[] }> = [];
  const groupIndexByKey = new Map<string, number>();
  for (const act of displayActions) {
    const key = act.batch_id || act.ai_action_id;
    const existingIdx = groupIndexByKey.get(key);
    if (existingIdx !== undefined) {
      groupedActionCards[existingIdx].items.push(act);
    } else {
      groupIndexByKey.set(key, groupedActionCards.length);
      groupedActionCards.push({
        key,
        batchId: act.batch_id ?? null,
        items: [act],
      });
    }
  }


  // A freshly arrived answer fades in from blur with a slight upward slide
  // (~450 ms); history and reduced-motion users get no animation.
  const isFresh =
    !reduceMotion && Date.now() - Date.parse(message.created_at) < 5000;

  return (
    <motion.article
      initial={isFresh ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="analyst-reply"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[var(--color-accent)]">Growth Analyst</span>
        {ttsSupported && message.content.trim() ? <button type="button" className="icon-button" aria-label={speaking?'Stop reading aloud':'Read answer aloud'} aria-pressed={speaking} onClick={toggleSpeak}>{speaking?<VolumeX size={16}/>:<Volume2 size={16}/>}</button>:null}
      </div>
      {/* Main answer prose */}
      <div className="mt-3 text-[14px] leading-relaxed text-[var(--color-ink)]">
        <MarkdownAnswer>{message.content.replace(/(?:^|\n)Source notes:\s*\n[\s\S]*$/i, '').trim()}</MarkdownAnswer>
      </div>

      {/* Server-built tables / charts / KPIs (numbers from tool results only) */}
      {structured?.blocks && structured.blocks.length > 0 ? (
        <AnswerBlocks blocks={structured.blocks} />
      ) : null}

      {/* Grounding / verification notice if flagged */}
      {integrity && !integrity.valid ? (
        <div
          role="status"
          className="mt-3 flex items-start gap-2 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-2 text-[13px] text-[var(--color-ink-muted)]"
        >
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9B3B32]"
            aria-hidden="true"
          />
          <span>{integrity.warnings.join(' ')}</span>
        </div>
      ) : null}

      {/* Dynamic AI View attachment summary */}
      {structured?.view_spec && onActivateView ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-accent)]/30 bg-[var(--color-surface-subtle)] px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[var(--color-ink)]">
              {structured.view_spec.title || 'Custom dashboard view ready'}
            </p>
            <p className="font-mono text-[12px] text-[var(--color-ink-subtle)]">
              {structured.view_spec.screen} ·{' '}
              {(structured.view_spec.widgets ?? []).length} widget(s)
            </p>
          </div>
          <button
            type="button"
            onClick={() => onActivateView(structured.view_spec!)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Open AI view</span>
          </button>
        </div>
      ) : null}

      {/* Unified batch proposal cards (1 card per batch/action group) */}
      {groupedActionCards.length > 0 ? (
        <div className="mt-4 space-y-3">
          {groupedActionCards.map((group) => {
            const batchId = group.batchId;
            const isBusy =
              (batchId ? batchProcessingId === batchId : false) ||
              group.items.some((a) => actionProcessingId === a.ai_action_id);
            const groupError =
              (batchId ? batchErrorById[batchId] : null) ??
              group.items
                .map((a) => actionErrorById[a.ai_action_id])
                .find((e) => Boolean(e)) ??
              null;

            return (
              <ProposedBatchCard
                key={group.key}
                actions={group.items}
                permissionProfile={permissionProfile}
                processing={isBusy}
                errorMessage={groupError}
                onConfirmAll={(acts) => {
                  if (batchId && acts.length >= 2 && onConfirmBatch) {
                    onConfirmBatch(batchId);
                  } else if (acts[0]) {
                    onRequestConfirmAction(acts[0]);
                  }
                }}
                onCancelAll={(acts) => {
                  if (batchId && acts.length >= 2 && onCancelBatch) {
                    onCancelBatch(batchId);
                  } else if (acts[0]) {
                    onCancelAction(acts[0].ai_action_id);
                  }
                }}
                onEditAction={onEditAction}
                onOpenRecord={onOpenRecord}
                compact={compact}
              />
            );
          })}
        </div>
      ) : null}

      {/* Thumbs up / down feedback */}
      {structured?.query_id && onSubmitFeedback ? (
        <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-[var(--color-border-subtle)] pt-2.5">
          <span className="mr-1 text-[12px] text-[var(--color-ink-subtle)]">Helpful?</span>
          <button
            type="button"
            aria-label="Mark answer helpful"
            aria-pressed={message.feedback === 'up'}
            onClick={() =>
              void onSubmitFeedback(
                message.message_id,
                structured.query_id!,
                'up'
              )
            }
            className={`inline-flex h-7 w-7 items-center justify-center rounded border transition-colors ${
              message.feedback === 'up'
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                : 'border-[var(--color-border)] bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]'
            }`}
          >
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Mark answer not helpful"
            aria-pressed={message.feedback === 'down'}
            onClick={() =>
              void onSubmitFeedback(
                message.message_id,
                structured.query_id!,
                'down'
              )
            }
            className={`inline-flex h-7 w-7 items-center justify-center rounded border transition-colors ${
              message.feedback === 'down'
                ? 'border-[#9B3B32] bg-[#FDF5F4] text-[#9B3B32]'
                : 'border-[var(--color-border)] bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]'
            }`}
          >
            <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* Server-returned contextual follow-up suggestions only */}
      {structured?.follow_up_suggestions &&
      structured.follow_up_suggestions.length > 0 &&
      onSelectFollowUp ? (
        <div className="mt-4 border-t border-[var(--color-border-subtle)] pt-3">
          <p className="mb-2 text-[12px] font-medium text-[var(--color-ink-subtle)]">
            Follow-up inquiries
          </p>
          <div className="flex flex-wrap gap-2">
            {structured.follow_up_suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSelectFollowUp(suggestion)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2.5 py-1 text-left text-[13px] text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] hover:bg-white"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </motion.article>
  );
}

