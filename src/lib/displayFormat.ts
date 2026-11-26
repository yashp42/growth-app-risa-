/**
 * Display-only formatting for analyst cards. Never computes business numbers:
 * it only renders values the server returned.
 */

const INR_GROUPING = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** ₹5,92,500: Indian digit grouping, the house style for exact amounts. */
export function formatInr(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '—';
  return `${n < 0 ? '−' : ''}₹${INR_GROUPING.format(Math.abs(n))}`;
}

/** ₹5.92L / ₹1.20Cr: compact form for headline figures, same rounding as the dashboard (toFixed(2)). */
export function formatInrLakh(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
  return formatInr(n);
}

const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "Fri 27 Nov 2026, 18:00 IST" for timestamps, "Fri 27 Nov 2026" for dates. */
export function formatIstDateTime(value: string): string {
  const dateOnly = ISO_DATE.test(value);
  const d = new Date(dateOnly ? `${value}T00:00:00+05:30` : value);
  if (Number.isNaN(d.getTime())) return value;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const day = `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
  return dateOnly ? day : `${day}, ${parts.hour}:${parts.minute} IST`;
}

const MONEY_FIELD = /(value|amount|total|cash|outstanding|received|signed_value|overdue)(_total)?$/;
const DATE_FIELD = /(_at|_date|^date|_on|due|start|end)$/;

const CONSIDERATION_LABEL: Record<string, string> = {
  cash: 'Cash',
  in_kind: 'In-kind',
  inkind: 'In-kind',
  barter: 'Barter',
};

export interface ContractLineLike {
  consideration_type?: unknown;
  value?: unknown;
  description?: unknown;
}

/** "Cash · ₹1,00,000" (with an optional description). */
export function formatContractLine(line: ContractLineLike): string {
  const type = String(line.consideration_type ?? '').toLowerCase();
  const label = CONSIDERATION_LABEL[type] ?? (type ? type.replace(/_/g, ' ') : 'Line');
  const desc = typeof line.description === 'string' && line.description.trim() ? ` · ${line.description.trim()}` : '';
  return `${label} · ${formatInr(line.value)}${desc}`;
}

export function isContractLineArray(value: unknown): value is ContractLineLike[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => v && typeof v === 'object' && 'value' in (v as object))
  );
}

/** Format any card field for display, by key and value shape. */
export function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (isContractLineArray(value)) return value.map(formatContractLine).join('; ');
  if (typeof value === 'string' && (ISO_TS.test(value) || (ISO_DATE.test(value) && DATE_FIELD.test(key)))) {
    return formatIstDateTime(value);
  }
  if (MONEY_FIELD.test(key) && (typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(String(value)))) {
    return formatInr(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map((v) => formatFieldValue(key, v)).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${formatFieldValue(k, v)}`)
      .join(' · ');
  }
  return String(value);
}

/** "stage" -> "Stage", "due_at" -> "Due", "signed_value_total" -> "Signed value total". */
export function formatFieldLabel(key: string): string {
  const k = key.replace(/_id$/, '').replace(/_at$/, '').replace(/_/g, ' ').trim();
  return k.charAt(0).toUpperCase() + k.slice(1);
}
