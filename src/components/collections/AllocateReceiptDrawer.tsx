import { AlertCircle } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  allocateReceipt,
  CollectionsApiError,
  formatCollectionsCurrency,
  formatScheduleKind,
} from '../../services/collectionsApi';
import type {
  CollectionsContractRow,
  CollectionsPermissionProfile,
  InvoiceRecord,
  PaymentScheduleItemRecord,
  ReceiptAllocationRecord,
  ReceiptRecord,
} from '../../types/collections';
import { SlideOverDrawer } from '../ui/SlideOverDrawer';

interface AllocateReceiptDrawerProps {
  open: boolean;
  receipt: ReceiptRecord | null;
  contracts: CollectionsContractRow[];
  paymentSchedules: PaymentScheduleItemRecord[];
  invoices: InvoiceRecord[];
  existingAllocations: ReceiptAllocationRecord[];
  activeEditionId: string;
  activeRecordClass: 'simulated' | 'live';
  permissionProfile: CollectionsPermissionProfile;
  onClose: () => void;
  onAllocated: (allocation: ReceiptAllocationRecord) => void;
}

export function AllocateReceiptDrawer({
  open,
  receipt,
  contracts,
  paymentSchedules,
  invoices,
  existingAllocations,
  activeEditionId,
  activeRecordClass,
  permissionProfile,
  onClose,
  onAllocated,
}: AllocateReceiptDrawerProps) {
  const [scheduleItemId, setScheduleItemId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sponsorContractIds = useMemo(() => {
    if (!receipt) return new Set<string>();
    return new Set(
      contracts
        .filter((c) => c.sponsor_id === receipt.sponsor_id)
        .map((c) => c.contract_id)
    );
  }, [contracts, receipt]);

  const sponsorSchedules = useMemo(
    () =>
      paymentSchedules.filter(
        (s) =>
          (receipt?.sponsor_id && s.sponsor_id === receipt.sponsor_id) ||
          sponsorContractIds.has(s.contract_id)
      ),
    [paymentSchedules, receipt, sponsorContractIds]
  );

  const sponsorInvoices = useMemo(
    () =>
      invoices.filter(
        (inv) =>
          inv.status === 'issued' &&
          ((receipt?.sponsor_id && inv.sponsor_id === receipt.sponsor_id) ||
            sponsorContractIds.has(inv.contract_id))
      ),
    [invoices, receipt, sponsorContractIds]
  );

  const allocatedSoFar = useMemo(() => {
    if (!receipt) return 0;
    if (
      typeof receipt.allocated_amount === 'number' &&
      Number.isFinite(receipt.allocated_amount)
    ) {
      return receipt.allocated_amount;
    }
    return existingAllocations
      .filter((a) => a.receipt_id === receipt.receipt_id)
      .reduce((acc, a) => acc + Number(a.amount || 0), 0);
  }, [receipt, existingAllocations]);

  const remainingReceiptAmount = useMemo(() => {
    if (!receipt) return 0;
    if (
      typeof receipt.unallocated_amount === 'number' &&
      Number.isFinite(receipt.unallocated_amount)
    ) {
      return Math.max(0, receipt.unallocated_amount);
    }
    return Math.max(0, Number(receipt.amount) - allocatedSoFar);
  }, [receipt, allocatedSoFar]);

  useEffect(() => {
    if (!open || !receipt) return;
    const defaultSched =
      sponsorSchedules.find((s) => (s.remaining_amount ?? s.amount_due) > 0) ??
      sponsorSchedules[0];
    const defaultInv = sponsorInvoices[0];
    setScheduleItemId(defaultSched?.schedule_item_id ?? '');
    setInvoiceId(defaultInv?.invoice_id ?? '');
    const suggested =
      remainingReceiptAmount > 0
        ? remainingReceiptAmount
        : Number(receipt.amount || 0);
    setAmount(suggested > 0 ? String(suggested) : '');
    setErrorMsg(null);
    setSubmitting(false);
  }, [open, receipt?.receipt_id]);

  if (!receipt) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!scheduleItemId.trim() && !invoiceId.trim()) {
      setErrorMsg(
        'Select at least one payment schedule item or issued invoice.'
      );
      return;
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setErrorMsg('Allocation amount must be greater than zero.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await allocateReceipt(
        {
          receipt_id: receipt.receipt_id,
          schedule_item_id: scheduleItemId.trim() || null,
          invoice_id: invoiceId.trim() || null,
          amount: numericAmount,
          record_class: activeRecordClass,
          edition_id: activeEditionId,
        },
        permissionProfile
      );
      onAllocated(created);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof CollectionsApiError
          ? err.message
          : 'Unable to allocate receipt.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SlideOverDrawer
      open={open}
      onClose={onClose}
      meta={`Receipt · ${receipt.receipt_id}`}
      title="Allocate receipt"
      subtitle="Link this receipt to an issued invoice or payment schedule item for the same sponsor. Reconciling and allocating together updates collected cash."
    >
      {sponsorSchedules.length===0&&sponsorInvoices.length===0?<div role="status" className="mb-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"><h3 className="text-sm font-semibold">No invoices or payment schedules to link</h3><p className="mt-1 text-sm text-[var(--color-ink-muted)]">This sponsor has no issued invoices or payment schedule items available. Add them in Collections, then return to link this receipt.</p></div>:null}
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-[#9B3B32]/30 bg-[#9B3B32]/5 px-3.5 py-2.5 text-[13px] text-[#9B3B32]"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        ) : null}

        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3.5 text-[13px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--color-ink-muted)]">Sponsor</span>
            <span className="font-medium text-[var(--color-ink)]">
              {receipt.sponsor_name || receipt.sponsor_id}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-[var(--color-ink-muted)]">Receipt amount</span>
            <span className="font-mono font-medium text-[var(--color-ink)] tabular-nums">
              {formatCollectionsCurrency(receipt.amount)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-[var(--color-ink-muted)]">Remaining unallocated</span>
            <span className="font-mono font-medium text-[var(--color-accent)] tabular-nums">
              {formatCollectionsCurrency(remainingReceiptAmount)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-[var(--color-ink-muted)]">Reconciliation state</span>
            <span className="font-medium text-[var(--color-ink)]">
              {receipt.reconciled
                ? 'Reconciled'
                : 'Unreconciled (reconcile to include in collected cash)'}
            </span>
          </div>
        </div>

        <div>
          <label
            htmlFor="alloc-schedule"
            className="block text-[13px] font-medium text-[var(--color-ink)]"
          >
            Payment schedule item
          </label>
          <select
            id="alloc-schedule"
            value={scheduleItemId}
            onChange={(e) => setScheduleItemId(e.target.value)}
            className="mt-1.5 h-9 w-full rounded-md border border-[var(--color-border)] bg-white px-3 text-[14px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="">— None —</option>
            {sponsorSchedules.map((s) => (
              <option key={s.schedule_item_id} value={s.schedule_item_id}>
                {formatScheduleKind(s.kind)} · {formatCollectionsCurrency(s.amount_due)} (due {s.due_date.slice(0, 10)}) · {s.schedule_item_id}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="alloc-invoice"
            className="block text-[13px] font-medium text-[var(--color-ink)]"
          >
            Issued invoice (optional if schedule selected)
          </label>
          <select
            id="alloc-invoice"
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            className="mt-1.5 h-9 w-full rounded-md border border-[var(--color-border)] bg-white px-3 text-[14px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="">— None —</option>
            {sponsorInvoices.map((inv) => (
              <option key={inv.invoice_id} value={inv.invoice_id}>
                {inv.invoice_no} · {formatCollectionsCurrency(inv.amount)} · {inv.contract_id}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="alloc-amount"
            className="block text-[13px] font-medium text-[var(--color-ink)]"
          >
            Allocation amount (INR)
          </label>
          <input
            id="alloc-amount"
            type="number"
            min="1"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1.5 h-9 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-mono text-[14px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
            required
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-[var(--color-border-subtle)] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-[var(--color-border)] bg-white px-4 text-[14px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-9 rounded-md bg-[var(--color-accent)] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#274D42] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Allocating...' : 'Save allocation'}
          </button>
        </div>
      </form>
    </SlideOverDrawer>
  );
}

