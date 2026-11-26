import { ShieldCheck, X } from 'lucide-react';
import { useEffect,useRef } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { formatFieldLabel } from '../../lib/displayFormat';
import { confirmDialogTitle } from '../../services/analystApi';
import { FieldValue } from './FieldValue';
import type { AiActionRecord } from '../../types/analyst';

interface ActionConfirmationDialogProps {
  action: AiActionRecord | null;
  processing?: boolean;
  onConfirm: (actionId: string) => void;
  onClose: () => void;
}

export function ActionConfirmationDialog({
  action,
  processing = false,
  onConfirm,
  onClose,
}: ActionConfirmationDialogProps) {
  const modalRef=useRef<HTMLDivElement>(null);
  useDialogFocus(Boolean(action),()=>{if(!processing)onClose();},modalRef);
  useEffect(() => {
    if (!action) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !processing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [action, processing, onClose]);

  if (!action) return null;

  const entries = Object.entries(action.payload ?? {});

  return (
    <div ref={modalRef} tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-ink)]/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-ai-action-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-start gap-2.5">
            <ShieldCheck
              className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-accent)]"
              aria-hidden="true"
            />
            <div>
              <p className="sr-only">
                {action.ai_action_id} · {action.permission_level}
              </p>
              <h2
                id="confirm-ai-action-title"
                className="text-[16px] font-semibold text-[var(--color-ink)]"
              >
                {confirmDialogTitle(action.action_type)}
              </h2>
            </div>
          </div>

          <button
            type="button"
            disabled={processing}
            onClick={onClose}
            aria-label="Close confirmation dialog"
            className="flex h-8 w-8 items-center justify-center rounded text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {action.affected_summary ? (
            <p className="text-[14px] text-[var(--color-ink)]">
              {action.affected_summary}
            </p>
          ) : null}

          <div className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3.5">
            <p className="mb-2 text-[12px] font-medium text-[var(--color-ink-subtle)]">
              Exact payload to execute
            </p>
            {entries.length === 0 ? (
              <p className="text-[13px] text-[var(--color-ink-muted)]">Empty payload</p>
            ) : (
              <dl className="divide-y divide-[var(--color-border-subtle)] text-[13px]">
                {entries.map(([key, val]) => (
                  <div
                    key={key}
                    className="grid grid-cols-1 gap-1 py-1.5 sm:grid-cols-3"
                  >
                    <dt className="text-[var(--color-ink-muted)]">{formatFieldLabel(key)}</dt>
                    <dd className="break-words font-medium text-[var(--color-ink)] sm:col-span-2">
                      <FieldValue field={key} value={val} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {action.payload_hash ? (
            <p className="font-mono text-[12px] text-[var(--color-ink-subtle)]">
              Payload hash: {action.payload_hash}
            </p>
          ) : null}

          <p className="text-[13px] text-[var(--color-ink-muted)]">
            Confirming writes this exact immutable payload under your account
            permissions and logs an audit event.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-5 py-3.5">
          <button
            type="button"
            disabled={processing}
            onClick={onClose}
            className="h-9 rounded-md border border-[var(--color-border)] bg-white px-4 text-[14px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            disabled={processing}
            onClick={() => onConfirm(action.ai_action_id)}
            className="h-9 rounded-md bg-[var(--color-accent)] px-4 text-[14px] font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--color-ink-subtle)]"
          >
            {processing ? 'Executing...' : 'Confirm & execute'}
          </button>
        </div>
      </div>
    </div>
  );
}

