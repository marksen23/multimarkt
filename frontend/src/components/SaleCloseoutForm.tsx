import { useState } from 'react';
import {
  computeSaleCloseout,
  formatEur,
  PAYMENT_METHODS,
  SALE_PORTALS,
  type SaleCloseoutDraft,
} from '../margin/sale-closeout';
import { useMarginAssumptions } from '../margin/use-margin-assumptions';

function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '' || normalized === '.') return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

/**
 * Erlös, Portal, Gebühren, Versand, optional Zahlungsweg.
 * Gebühr und Versand starten bei den gepflegten Annahmen und bleiben editierbar.
 */
export function SaleCloseoutForm({
  initialProceeds,
  initialPortal,
  purchasePriceEur,
  showProfit,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialProceeds: number | null;
  initialPortal: string;
  purchasePriceEur: number | null;
  showProfit: boolean;
  busy: boolean;
  submitLabel: string;
  onSubmit: (draft: SaleCloseoutDraft) => void;
  onCancel?: () => void;
}) {
  const assumptions = useMarginAssumptions();
  const [proceeds, setProceeds] = useState(initialProceeds == null ? '' : String(initialProceeds));
  const [portal, setPortal] = useState(initialPortal || 'Kleinanzeigen');
  const [fee, setFee] = useState('');
  const [feeTouched, setFeeTouched] = useState(false);
  const [shipping, setShipping] = useState('');
  const [shippingTouched, setShippingTouched] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');

  const proceedsNumber = parseAmount(proceeds);
  const suggestedFee =
    assumptions && proceedsNumber != null
      ? Math.round(proceedsNumber * (assumptions.feePercent / 100) * 100) / 100
      : null;
  const feeValue = feeTouched ? fee : suggestedFee == null ? fee : String(suggestedFee);
  const shippingValue = shippingTouched
    ? shipping
    : assumptions
      ? String(assumptions.shippingEur)
      : shipping;
  const feeNumber = feeValue.trim() === '' ? null : parseAmount(feeValue);
  const shippingNumber = shippingValue.trim() === '' ? null : parseAmount(shippingValue);
  const proceedsOk = proceedsNumber != null && proceedsNumber > 0;

  const preview =
    proceedsOk && feeNumber != null && shippingNumber != null
      ? computeSaleCloseout({
          proceedsEur: proceedsNumber,
          feeEur: feeNumber,
          shippingEur: shippingNumber,
          purchasePriceEur: showProfit ? purchasePriceEur : null,
        })
      : null;

  const portals = (SALE_PORTALS as readonly string[]).includes(portal)
    ? [...SALE_PORTALS]
    : [portal, ...SALE_PORTALS];

  const submit = () => {
    if (!preview || !portal.trim()) return;
    onSubmit({
      proceedsEur: preview.proceedsEur,
      portal: portal.trim(),
      feeEur: preview.feeEur,
      shippingEur: preview.shippingEur,
      paymentMethod: paymentMethod.trim() || null,
    });
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="block text-[10px] font-bold text-ink-faint uppercase">Erlös €</span>
          <input
            type="text"
            inputMode="decimal"
            value={proceeds}
            onChange={(e) => setProceeds(e.target.value)}
            className="w-full p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
            autoFocus
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[10px] font-bold text-ink-faint uppercase">Portal</span>
          <select
            value={portal}
            onChange={(e) => setPortal(e.target.value)}
            className="w-full p-2 border border-line rounded-lg text-xs bg-surface text-ink outline-none focus:border-accent"
          >
            {portals.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-[10px] font-bold text-ink-faint uppercase">Gebühren €</span>
          <input
            type="text"
            inputMode="decimal"
            value={feeValue}
            onChange={(e) => {
              setFeeTouched(true);
              setFee(e.target.value);
            }}
            className="w-full p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[10px] font-bold text-ink-faint uppercase">Versand €</span>
          <input
            type="text"
            inputMode="decimal"
            value={shippingValue}
            onChange={(e) => {
              setShippingTouched(true);
              setShipping(e.target.value);
            }}
            className="w-full p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
          />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="block text-[10px] font-bold text-ink-faint uppercase">Zahlungsweg</span>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className="w-full p-2 border border-line rounded-lg text-xs bg-surface text-ink outline-none focus:border-accent"
        >
          <option value="">optional</option>
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
      </label>

      {preview && (
        <div className="text-xs text-ink space-y-1">
          <p>
            Netto {formatEur(preview.netEur)}
            {showProfit && (
              <>
                {' '}
                · Nettogewinn{' '}
                <span className={preview.netProfitEur != null && preview.netProfitEur < 0 ? 'text-danger font-bold' : 'font-bold'}>
                  {formatEur(preview.netProfitEur)}
                </span>
              </>
            )}
          </p>
          {showProfit && purchasePriceEur == null && (
            <p className="text-ink-muted">Einstand fehlt — Nettogewinn erst nach dem Einkauf.</p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !preview || !portal.trim()}
          onClick={submit}
          className="text-[11px] font-bold px-2 py-1 rounded-lg bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="text-[11px] font-bold px-2 py-1 rounded-lg bg-surface-hover text-ink-muted hover:bg-line disabled:opacity-60 transition-colors"
          >
            Abbrechen
          </button>
        )}
      </div>
    </div>
  );
}
