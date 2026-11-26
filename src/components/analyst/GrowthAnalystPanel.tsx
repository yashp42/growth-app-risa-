import { AlertCircle, Compass, Maximize2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { UseGrowthAnalystSessionResult } from '../../hooks/useGrowthAnalystSession';
import { formatRecordClassLabel } from '../../services/analystApi';
import { findNavItem } from '../../services/overviewApi';
import type { AiActionRecord, AiViewSpec } from '../../types/analyst';
import type { NavSectionId } from '../../types/overview';
import { ActionConfirmationDialog } from './ActionConfirmationDialog';
import { ChatComposer } from './ChatComposer';
import { ChatMessage } from './ChatMessage';
import { ReadAloudToggle } from './ReadAloudToggle';

const PANEL_STARTERS: ReadonlyArray<string> = [
  'Which campaign is leaking the most qualified leads?',
  'How much cash did we collect in 2025?',
  'Which signed partnerships still have outstanding cash?',
];

interface GrowthAnalystPanelProps {
  open: boolean;
  onClose: () => void;
  contextSection: NavSectionId;
  session: UseGrowthAnalystSessionResult;
  autoStartVoiceNonce?: number;
  onOpenFullWorkspace: (promptContext?: string) => void;
  onEditAction?: (action: AiActionRecord) => void;
  onOpenRecord?: (recordType: string, recordId: string) => void;
  onOpenAiViewScreen?: (
    screen: AiViewSpec['screen'],
    filters?: Record<string, string>
  ) => void;
}

export function GrowthAnalystPanel({
  open,
  onClose,
  contextSection,
  session,
  autoStartVoiceNonce = 0,
  onOpenFullWorkspace,
  onEditAction,
  onOpenRecord,
  onOpenAiViewScreen,
}: GrowthAnalystPanelProps) {
  const [pendingConfirmAction, setPendingConfirmAction] =
    useState<AiActionRecord | null>(null);
  const currentView = findNavItem(contextSection);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  const actionsById = session.actions.reduce<Record<string, AiActionRecord>>(
    (acc, item) => {
      acc[item.ai_action_id] = item;
      return acc;
    },
    {}
  );

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingConfirmAction) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, pendingConfirmAction, onClose]);

  useEffect(() => {
    if (open) {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [open, session.messages.length, session.sending]);

  if (!open) return null;

  return (
    <>
      {/* Mobile backdrop for bottom sheet */}
      <div
        className="fixed inset-0 z-40 bg-[var(--color-ink)]/25 sm:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="false"
        aria-label="Growth Analyst"
        className="fixed inset-x-0 bottom-0 z-50 flex h-[84vh] max-h-[680px] flex-col rounded-t-xl border-t border-[var(--color-border)] bg-white shadow-2xl sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[560px] sm:max-h-[calc(100vh-5.5rem)] sm:w-[480px] sm:rounded-2xl sm:border sm:shadow-xl"
      >
        {/* Drag handle on mobile */}
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-[var(--color-border)]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <Compass className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[14px] font-semibold text-[var(--color-ink)]">
                Growth Analyst
              </h2>
              <p className="truncate font-mono text-[12px] text-[var(--color-ink-subtle)]">
                {currentView.label} ·{' '}
                {formatRecordClassLabel(session.filters.record_class)}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <ReadAloudToggle
              compact
              on={session.autoReadAloud}
              supported={session.readAloudSupported}
              onChange={session.setAutoReadAloud}
            />
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFullWorkspace();
              }}
              title="Open Growth Analyst workspace"
              aria-label="Open Growth Analyst workspace"
              className="flex h-8 w-8 items-center justify-center rounded text-[var(--color-ink-muted)] transition-colors duration-150 hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]"
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Growth Analyst"
              className="flex h-8 w-8 items-center justify-center rounded text-[var(--color-ink-muted)] transition-colors duration-150 hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Conversation Body */}
        <div className="flex-1 space-y-3 overflow-y-auto bg-[var(--color-canvas)]/50 px-3.5 py-3.5">
          {session.messages.length === 0 ? (
            <div className="space-y-3">
              <div className="rounded border border-[var(--color-border-subtle)] bg-white p-3">
                <p className="text-[13px] font-medium text-[var(--color-ink)]">
                  {session.filters.edition_id} · As of {session.filters.as_of}
                </p>
                <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
                  Ask about this workspace, explore performance or prepare a follow-up.
                </p>
              </div>

              <div className="divide-y divide-[var(--color-border-subtle)] rounded border border-[var(--color-border-subtle)] bg-white">
                {PANEL_STARTERS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={session.sending}
                    onClick={() => void session.sendMessage(prompt)}
                    className="block w-full px-3 py-2.5 text-left text-[13px] text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-subtle)] disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            session.messages.map((msg) => (
              <ChatMessage
                key={msg.message_id}
                message={msg}
                actionsById={actionsById}
                permissionProfile={session.permissionProfile}
                actionProcessingId={session.actionProcessingId}
                actionErrorById={session.actionErrorById}
                batchProcessingId={session.batchProcessingId}
                batchErrorById={session.batchErrorById}
                onSelectFollowUp={(q) => void session.sendMessage(q)}
                onRequestConfirmAction={setPendingConfirmAction}
                onCancelAction={(id) => void session.cancelAction(id)}
                onConfirmBatch={(id) => void session.confirmBatch(id)}
                onCancelBatch={(id) => void session.cancelBatch(id)}
                onEditAction={(act) => {
                  onClose();
                  onEditAction?.(act);
                }}
                onActivateView={(spec) => {
                  session.setActiveViewSpec(spec);
                  onClose();
                  if (onOpenAiViewScreen) {
                    onOpenAiViewScreen(spec.screen, spec.filters);
                  } else {
                    onOpenFullWorkspace();
                  }
                }}
                onOpenRecord={(type, id) => {
                  onClose();
                  onOpenRecord?.(type, id);
                }}
                onSubmitFeedback={session.submitFeedback}
                compact
              />
            ))
          )}

          {session.sending ? (
            <div className="rounded border border-[var(--color-border)] bg-white px-3 py-2.5 text-[13px] text-[var(--color-ink-muted)]">
              Retrieving metrics and evidence...
            </div>
          ) : null}

          {session.error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded border border-[var(--color-border)] bg-white p-3 text-[13px]"
            >
              <AlertCircle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9B3B32]"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[var(--color-ink)]">
                  {session.error.status === 403
                    ? 'Permission restricted'
                    : 'Growth Analyst service unavailable'}
                </p>
                <p className="mt-0.5 text-[var(--color-ink-muted)]">{session.error.message}</p>
              </div>
              <button
                type="button"
                onClick={session.dismissError}
                className="shrink-0 text-[12px] font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <div ref={feedEndRef} />
        </div>

        {/* Live Composer Footer */}
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3">
          <ChatComposer
            onSend={session.sendMessage}
            sending={session.sending}
            disabled={
              session.permissionProfile.verifiedByServer &&
              !session.permissionProfile.canUseAnalyst
            }
            compact
            autoStartVoiceNonce={autoStartVoiceNonce}
            onListeningChange={session.setVoiceListening}
            onInterimTranscript={session.setInterimTranscript}
            placeholder="Ask Growth Analyst..."
          />
        </div>
      </aside>

      <ActionConfirmationDialog
        action={pendingConfirmAction}
        processing={
          pendingConfirmAction
            ? session.actionProcessingId === pendingConfirmAction.ai_action_id
            : false
        }
        onConfirm={async (id) => {
          await session.confirmAction(id);
          setPendingConfirmAction(null);
        }}
        onClose={() => setPendingConfirmAction(null)}
      />
    </>
  );
}

