import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import {
  fetchAuditLog,
  TeamAdminApiError,
  type AuditLogEvent,
} from '../../services/teamAdminApi';

export const AUDIT_LOG_ANCHOR_ID = 'audit-log';
const AUDIT_LOG_LIMIT = 50;

const OPERATION_LABEL: Record<AuditLogEvent['operation'], string> = {
  insert: 'Created',
  update: 'Updated',
  soft_delete: 'Archived',
};

function formatIstTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function ChannelBadge({ channel }: { channel: AuditLogEvent['channel'] }) {
  const isAi = channel === 'ai_action';
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] ${
        isAi
          ? 'border border-[#BFD3CB] bg-[#EEF5F2] text-[#264B40]'
          : 'border border-[#E8E6E0] bg-[#FAF9F6] text-[#525E58]'
      }`}
    >
      {channel}
    </span>
  );
}

/**
 * Read-only audit log: the latest audit_event rows from GET /api/audit.
 * Its query is refetched by the global invalidation after an AI confirm.
 */
export function AuditLogPanel() {
  const query = useQuery({
    queryKey: ['audit-log', AUDIT_LOG_LIMIT],
    queryFn: () => fetchAuditLog(AUDIT_LOG_LIMIT),
    retry: (count, err) =>
      !(err instanceof TeamAdminApiError && err.status === 403) && count < 2,
  });

  const forbidden =
    query.error instanceof TeamAdminApiError && query.error.status === 403;
  const events = query.data ?? [];

  return (
    <section
      id={AUDIT_LOG_ANCHOR_ID}
      aria-labelledby="audit-log-heading"
      className="scroll-mt-6 rounded-md border border-[#D9D7D0] bg-white p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="audit-log-heading" className="text-[16px] font-semibold text-[#202824]">
            Audit log
          </h2>
          <p className="mt-1 text-[13px] text-[#525E58]">
            Latest {AUDIT_LOG_LIMIT} writes, read-only. Channel{' '}
            <code className="font-mono text-[12px]">ai_action</code> marks changes applied
            after a person accepted an analyst proposal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#D9D7D0] px-3 py-1.5 text-[12px] font-medium text-[#525E58] hover:border-[#788C83] hover:text-[#202824] disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          Refresh
        </button>
      </div>

      <div className="mt-4">
        {forbidden ? (
          <p className="text-[13px] text-[#788C83]">
            The audit log needs the coordination lead or admin role.
          </p>
        ) : query.isLoading ? (
          <p className="text-[13px] text-[#788C83]">Loading audit log…</p>
        ) : query.isError ? (
          <p className="text-[13px] text-[#9B3B32]">
            Couldn't load the audit log: {(query.error as Error).message}
          </p>
        ) : events.length === 0 ? (
          <p className="text-[13px] text-[#788C83]">No audit events yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[#E8E6E0]">
            <table className="min-w-full divide-y divide-[#E8E6E0] text-left text-[12px]">
              <thead className="bg-[#FAF9F6] text-[11px] uppercase tracking-wide text-[#788C83]">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Time (IST)</th>
                  <th scope="col" className="px-3 py-2 font-medium">Actor</th>
                  <th scope="col" className="px-3 py-2 font-medium">Channel</th>
                  <th scope="col" className="px-3 py-2 font-medium">Entity</th>
                  <th scope="col" className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EEE8]">
                {events.map((ev) => (
                  <tr key={ev.audit_id}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-[#525E58]">
                      {formatIstTime(ev.at)}
                    </td>
                    <td className="px-3 py-2 text-[#202824]">
                      {ev.actor_name ?? ev.actor_id}
                      <span className="ml-1 font-mono text-[11px] text-[#788C83]">
                        {ev.actor_id}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <ChannelBadge channel={ev.channel} />
                    </td>
                    <td className="px-3 py-2 text-[#202824]">
                      {ev.entity.toLowerCase().replace(/_/g, ' ')}
                      <span className="ml-1 font-mono text-[11px] text-[#788C83]">
                        {ev.entity_id}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#202824]">
                      {OPERATION_LABEL[ev.operation] ?? ev.operation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
