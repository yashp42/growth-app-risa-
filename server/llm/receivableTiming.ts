type PaymentScheduleLine = { due_date?: unknown; remaining_amount?: unknown };
type ReceivableLike = { payment_schedule?: unknown; overdue_amount?: unknown };

/** Compute past-due value against the edition's as-of date, not the DB server clock. */
export function documentedOverdueAmount(record: ReceivableLike, asOf: string): number | null {
  const effectiveAsOf = asOf.slice(0, 10);
  const schedules = Array.isArray(record.payment_schedule)
    ? record.payment_schedule as PaymentScheduleLine[]
    : [];
  const unpaid = schedules.filter(row => Number(row.remaining_amount) > 0);
  const dated = unpaid.filter(row => typeof row.due_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.due_date));
  if (!dated.length) {
    const recorded = Number(record.overdue_amount);
    return Number.isFinite(recorded) && recorded > 0 ? recorded : null;
  }
  return dated.reduce((total, row) => {
    const dueDate = String(row.due_date).slice(0, 10);
    return total + (dueDate < effectiveAsOf ? Number(row.remaining_amount) : 0);
  }, 0);
}

export function compareReceivableUrgency(a: ReceivableLike & { outstanding?: unknown }, b: ReceivableLike & { outstanding?: unknown }, asOf: string): number {
  const aOverdue = documentedOverdueAmount(a, asOf);
  const bOverdue = documentedOverdueAmount(b, asOf);
  const aRank = aOverdue === null ? -1 : aOverdue;
  const bRank = bOverdue === null ? -1 : bOverdue;
  return bRank - aRank || Number(b.outstanding ?? 0) - Number(a.outstanding ?? 0);
}
