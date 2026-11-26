import { AlertCircle } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  CollectionsApiError,
  formatCollectionsCurrency,
  updateContractPaymentTerms,
} from '../../services/collectionsApi';
import {
  PAYMENT_TERMS_OPTIONS,
  type CollectionsContractRow,
  type CollectionsPermissionProfile,
} from '../../types/collections';
import { SlideOverDrawer } from '../ui/SlideOverDrawer';

interface PaymentTermsDrawerProps {
  open: boolean;
  contract: CollectionsContractRow | null;
  permissionProfile: CollectionsPermissionProfile;
  onClose: () => void;
  onUpdated: (contract: CollectionsContractRow) => void;
}

export function PaymentTermsDrawer({
  open,
  contract,
  permissionProfile,
  onClose,
  onUpdated,
}: PaymentTermsDrawerProps) {
  const [termsChoice, setTermsChoice] = useState<
    'standard_50_50' | '100_upfront' | 'custom'
  >('standard_50_50');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !contract) return;
    const raw = (contract.payment_terms ?? 'standard_50_50')
      .trim()
      .toLowerCase();
    if (raw === '100_upfront' || raw === '100% upfront') {
      setTermsChoice('100_upfront');
    } else if (raw === 'custom') {
      setTermsChoice('custom');
    } else {
      setTermsChoice('standard_50_50');
    }
    setErrorMsg(null);
    setSubmitting(false);
  }, [open, contract]);

  if (!contract) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    setSubmitting(true);
    try {
      const updated = await updateContractPaymentTerms(
        contract.contract_id,
        { payment_terms: termsChoice },
        permissionProfile
      );
      onUpdated(updated);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof CollectionsApiError
          ? err.message
          : 'Unable to update payment terms.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SlideOverDrawer
      open={open}
      onClose={onClose}
      meta={`Contract · ${contract.contract_id}`}
      title="Edit payment terms"
      subtitle="Finance & Collections may update payment terms only. Signed contract value and line items are immutable."
    >
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
            <span className="text-[var(--color-ink-muted)]">Sponsor / Opportunity</span>
            <span className="font-medium text-[var(--color-ink)]">
              {contract.sponsor_name ||
                contract.opportunity_name ||
                contract.opportunity_id}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[var(--color-ink-muted)]">Signed value total (immutable)</span>
            <span className="font-mono font-medium text-[var(--color-accent)] tabular-nums">
              {formatCollectionsCurrency(contract.signed_value_total)}
            </span>
          </div>
          {contract.lines && contract.lines.length > 0 ? (
            <div className="mt-2 border-t border-[var(--color-border-subtle)] pt-2 text-[12px] text-[var(--color-ink-muted)]">
              {contract.lines
                .map(
                  (l) =>
                    `${l.consideration_type === 'in_kind' ? 'In-kind' : 'Cash'}: ${formatCollectionsCurrency(l.value)}`
                )
                .join(' · ')}
            </div>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="payment-terms-select"
            className="block text-[13px] font-medium text-[var(--color-ink)]"
          >
            Payment terms
          </label>
          <select
            id="payment-terms-select"
            value={termsChoice}
            onChange={(e) =>
              setTermsChoice(
                e.target.value as 'standard_50_50' | '100_upfront' | 'custom'
              )
            }
            className="mt-1.5 h-9 w-full rounded-md border border-[var(--color-border)] bg-white px-3 text-[14px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            {PAYMENT_TERMS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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
            {submitting ? 'Updating...' : 'Save payment terms'}
          </button>
        </div>
      </form>
    </SlideOverDrawer>
  );
}
