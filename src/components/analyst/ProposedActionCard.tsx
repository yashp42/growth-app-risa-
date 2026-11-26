import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Lock,
  Pencil,
  XCircle,
} from 'lucide-react';
import { formatFieldLabel, formatFieldValue } from '../../lib/displayFormat';
import { FieldValue } from './FieldValue';
import {
  canUserConfirmActionType,
  formatAiActionStatus,
  formatAiActionType,
} from '../../services/analystApi';
import type { AiActionRecord, AiPermissionProfile } from '../../types/analyst';

interface ProposedActionCardProps {
  action: AiActionRecord;
  permissionProfile: AiPermissionProfile;
  processing?: boolean;
  errorMessage?: string | null;
  onRequestConfirm: (action: AiActionRecord) => void;
  onCancel: (actionId: string) => void;
  onEditAction?: (action: AiActionRecord) => void;
  onOpenRecord?: (recordType: string, recordId: string) => void;
  compact?: boolean;
}

interface ProposedBatchCardProps {
  actions: AiActionRecord[];
  permissionProfile: AiPermissionProfile;
  processing?: boolean;
  errorMessage?: string | null;
  onConfirmAll: (actions: AiActionRecord[]) => void;
  onCancelAll: (actions: AiActionRecord[]) => void;
  onEditAction?: (action: AiActionRecord) => void;
  onOpenRecord?: (recordType: string, recordId: string) => void;
  compact?: boolean;
}

export function ProposedBatchCard({
  actions,
  permissionProfile,
  processing = false,
  errorMessage,
  onConfirmAll,
  onCancelAll,
  onEditAction,
  onOpenRecord,
  compact = false,
}: ProposedBatchCardProps) {
  if (actions.length === 0) return null;
  const first = actions[0];
  const isSingle = actions.length === 1;
  const batchId = first.batch_id ?? null;

  const anyProposed = actions.some((a) => a.status === 'proposed');
  const allExecuted = actions.every(
    (a) => a.status === 'executed' || a.status === 'confirmed'
  );
  const allDeclined = actions.every(
    (a) =>
      a.status === 'cancelled' ||
      a.status === 'rejected' ||
      a.status === 'expired'
  );

  const permResults = actions
    .filter((a) => a.status === 'proposed')
    .map((a) => canUserConfirmActionType(permissionProfile, a));
  const blockedPerm = permResults.find((r) => !r.allowed) ?? null;

  const impactedNotes = Array.from(
    new Set(
      actions
        .map((a) => a.impacted_note)
        .filter((n): n is string => Boolean(n && n.trim()))
    )
  );

  const statusLabel = anyProposed
    ? actions.length > 1
      ? `${actions.length} proposed`
      : formatAiActionStatus(first.status)
    : allExecuted
      ? 'Applied'
      : allDeclined
        ? formatAiActionStatus(first.status)
        : 'Partially resolved';

  return (
    <div className="rounded-md border border-[#D9D7D0] bg-white p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#E8E6E0] pb-2.5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-semibold text-[#315F52]">
              {isSingle
                ? formatAiActionType(first.action_type)
                : `Proposed change batch (${actions.length} changes)`}
            </span>
            <span className="font-mono text-[11px] text-[#788C83]">
              · {batchId || first.ai_action_id}
            </span>
          </div>
          {isSingle && first.affected_summary ? (
            <p className="mt-1 text-[13px] font-medium text-[#202824]">
              {first.affected_summary}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          {allExecuted ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-[#315F52]" aria-hidden="true" />
          ) : allDeclined ? (
            <XCircle className="h-3.5 w-3.5 text-[#788C83]" aria-hidden="true" />
          ) : null}
          <span
            className={
              allExecuted
                ? 'font-medium text-[#315F52]'
                : allDeclined
                  ? 'text-[#788C83]'
                  : 'font-medium text-[#202824]'
            }
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Items with before -> after field diffs */}
      <div className="mt-3 divide-y divide-[#E8E6E0]">
        {actions.map((action) => {
          const diffs = action.field_diffs ?? [];
          const payloadEntries = Object.entries(action.payload ?? {}).filter(
            ([k]) => k !== '_preview' && k !== '_target_guard'
          );
          const itemExecuted =
            action.status === 'executed' || action.status === 'confirmed';

          return (
            <div key={action.ai_action_id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  {!isSingle ? (
                    <p className="text-[12px] font-medium text-[#202824]">
                      <span className="font-mono text-[11px] text-[#315F52]">
                        {formatAiActionType(action.action_type)}
                      </span>
                      {action.affected_summary
                        ? ` — ${action.affected_summary}`
                        : ''}
                    </p>
                  ) : null}
                </div>

                {action.status === 'proposed' && onEditAction ? (
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => onEditAction(action)}
                    className="inline-flex h-6 items-center gap-1 rounded border border-[#D9D7D0] bg-[#FAF9F6] px-2 text-[11px] font-medium text-[#202824] transition-colors hover:border-[#315F52] hover:text-[#315F52] disabled:opacity-50"
                  >
                    <Pencil className="h-3 w-3" aria-hidden="true" />
                    <span>Edit</span>
                  </button>
                ) : null}
              </div>

              {diffs.length > 0 ? (
                <ul className="mt-2 space-y-1.5 text-[12px]">
                  {diffs.map((diff, idx) => (
                    <li
                      key={`${diff.field}-${idx}`}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded bg-[#FAF9F6] px-2.5 py-1.5"
                    >
                      <span className="text-[11px] text-[#788C83]">
                        {formatFieldLabel(diff.field)}:
                      </span>
                      {diff.before === null || diff.before === undefined || diff.before === '' ? null : (
                        <>
                          <span className="text-[#525E58]">
                            <FieldValue field={diff.field} value={diff.before} />
                          </span>
                          <ArrowRight
                            className="inline h-3 w-3 shrink-0 text-[#788C83]"
                            aria-hidden="true"
                          />
                        </>
                      )}
                      <span className="font-medium text-[#202824]">
                        <FieldValue field={diff.field} value={diff.after} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : payloadEntries.length > 0 ? (
                <dl
                  className={`mt-2 grid gap-x-4 gap-y-1.5 text-[12px] ${
                    compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
                  }`}
                >
                  {payloadEntries.map(([field, val]) => (
                    <div key={field} className="min-w-0">
                      <dt className="text-[11px] text-[#788C83]">
                        {formatFieldLabel(field)}
                      </dt>
                      <dd
                        className="font-medium break-words text-[#202824]"
                        title={formatFieldValue(field, val)}
                      >
                        <FieldValue field={field} value={val} />
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {(action.date_resolutions ?? []).length > 0 ? (
                <ul className="mt-1.5 space-y-0.5 text-[11px] text-[#525E58]">
                  {(action.date_resolutions ?? []).map((r) => (
                    <li key={`${r.field}-${r.input}`}>
                      <span className="font-medium text-[#202824]">
                        {formatFieldLabel(r.field)}: {r.display}
                      </span>{' '}
                      (from “{r.input}”, resolved on the server in IST)
                    </li>
                  ))}
                </ul>
              ) : null}

              {itemExecuted &&
              action.created_record_id &&
              action.created_record_type ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-[#525E58]">
                  <span>
                    Record: {action.created_record_type} ·{' '}
                    {action.created_record_id}
                    {action.audit_event_id
                      ? ` · Audit ${action.audit_event_id}`
                      : ''}
                  </span>
                  {onOpenRecord ? (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenRecord(
                          action.created_record_type!,
                          action.created_record_id!
                        )
                      }
                      className="inline-flex items-center gap-1 font-sans text-[12px] font-medium text-[#315F52] hover:underline"
                    >
                      <span>Open record</span>
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Impacted screens & metrics */}
      {impactedNotes.length > 0 ? (
        <div className="mt-3 rounded border border-[#E8E6E0] bg-[#FAF9F6] px-3 py-2 text-[11px] text-[#525E58]">
          <span className="font-semibold text-[#202824]">Impacts: </span>
          {impactedNotes.join(' · ')}
        </div>
      ) : null}

      {/* Permission boundary notice */}
      {anyProposed && blockedPerm ? (
        <div className="mt-3 flex items-start gap-2 rounded border border-[#E8E6E0] bg-[#FAF9F6] px-3 py-2 text-[12px] text-[#525E58]">
          <Lock
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9B3B32]"
            aria-hidden="true"
          />
          <span>{blockedPerm.reason}</span>
        </div>
      ) : null}

      {errorMessage || first.error_message ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded border border-[#D9D7D0] bg-[#FAF9F6] px-3 py-2 text-[12px] text-[#9B3B32]"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{errorMessage || first.error_message}</span>
        </div>
      ) : null}

      {/* Unified Accept all / Cancel */}
      {anyProposed ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-[#E8E6E0] pt-3">
          <button
            type="button"
            disabled={processing}
            onClick={() => onCancelAll(actions)}
            className="h-8 rounded-md border border-[#D9D7D0] bg-white px-3 text-[12px] font-medium text-[#202824] transition-colors hover:bg-[#FAF9F6] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={processing || Boolean(blockedPerm)}
            onClick={() => onConfirmAll(actions)}
            className="h-8 rounded-md bg-[#315F52] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#264B40] disabled:cursor-not-allowed disabled:bg-[#788C83]"
          >
            {processing
              ? 'Applying...'
              : isSingle
                ? 'Accept all'
                : `Accept all (${actions.filter((a) => a.status === 'proposed').length})`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ProposedActionCard({
  action,
  permissionProfile,
  processing = false,
  errorMessage,
  onRequestConfirm,
  onCancel,
  onEditAction,
  onOpenRecord,
  compact = false,
}: ProposedActionCardProps) {
  return (
    <ProposedBatchCard
      actions={[action]}
      permissionProfile={permissionProfile}
      processing={processing}
      errorMessage={errorMessage}
      onConfirmAll={(acts) => {
        if (acts[0]) onRequestConfirm(acts[0]);
      }}
      onCancelAll={(acts) => {
        if (acts[0]) onCancel(acts[0].ai_action_id);
      }}
      onEditAction={onEditAction}
      onOpenRecord={onOpenRecord}
      compact={compact}
    />
  );
}
