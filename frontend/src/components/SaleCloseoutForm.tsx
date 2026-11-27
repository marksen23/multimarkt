import { useState } from 'react';
import { useMarginAssumptions } from '../margin/use-margin-assumptions';
import {
  computeSaleCloseout,
  formatEur,
  PAYMENT_METHODS,
  SALE_PORTALS,
  suggestedSaleFeeEur,
  type SaleCloseoutDraft,
} from '../margin/sale-closeout';
import { Button, inputClass } from '../ui';

function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '' || normalized === '.') return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

function todayIso(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Preis, Kanal und Datum stehen offen und sind vorausgefüllt.
 * Gebühren, Versand, Käufer und Notiz bleiben zu, damit Speichern
 * ohne weitere Eingabe geht.
 */
export function SaleCloseoutForm({
  initialProceeds,
  initialPortal,
  initialSoldOn,
  priceByPortal,
  pickupOnly = false,
  purchasePriceEur,
  showProfit,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialProceeds: number | null;
  initialPortal: string;
  initialSoldOn?: string | null;
  priceByPortal?: Record<string, number>;
  pickupOnly?: boolean;
  purchasePriceEur: number | null;
  showProfit: boolean;
  busy: boolean;
  submitLabel: string;
  onSubmit: (draft: SaleCloseoutDraft) => void;
  onCancel?: () => void;
}) {
  const assumptions = useMarginAssumptions();
  const [proceeds, setProceeds] = useState(initialProceeds == null ? '' : String(initialProceeds));
  const [proceedsTouched, setProceedsTouched] = useState(false);
  const [portal, setPortal] = useState(initialPortal || 'Kleinanzeigen');
  const [soldOn, setSoldOn] = useState(initialSoldOn || todayIso());
  const [fee, setFee] = useState('');
  const [feeTouched, setFeeTouched] = useState(false);
  const [shipping, setShipping] = useState('');
  const [shippingTouched, setShippingTouched] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [buyer, setBuyer] = useState('');
  const [notes, setNotes] = useState('');

  const suggestedProceeds = priceByPortal?.[portal];
  const proceedsValue =
    !proceedsTouched && suggestedProceeds != null ? String(suggestedProceeds) : proceeds;
  const proceedsNumber = parseAmount(proceedsValue);
  const suggestedFee =
    proceedsNumber == null ? 0 : suggestedSaleFeeEur(proceedsNumber, portal, assumptions?.channels ?? null);
  const feeValue = feeTouched ? fee : String(suggestedFee);
  const shippingValue = shippingTouched
    ? shipping
    : String(pickupOnly ? 0 : (assumptions?.shippingEur ?? 0));
  const feeNumber = feeValue.trim() === '' ? null : parseAmount(feeValue);
  const shippingNumber = shippingValue.trim() === '' ? null : parseAmount(shippingValue);
  const proceedsOk = proceedsNumber != null && proceedsNumber > 0;
  const dateOk = isIsoDate(soldOn) && soldOn >= '2000-01-01' && soldOn <= shiftIso(todayIso(), 1);

  const preview =
    proceedsOk && feeNumber != null && shippingNumber != null
      ? computeSaleCloseout({
          proceedsEur: proceedsNumber,
          feeEur: feeNumber,
          shippingEur: shippingNumber,
          purchasePriceEur: showProfit ? purchasePriceEur : null,
        })
      : null;

  const knownPortals = SALE_PORTALS as readonly string[];
  const portals = knownPortals.includes(portal) ? [...SALE_PORTALS] : [portal, ...SALE_PORTALS];

  const submit = () => {
    if (!preview || !portal.trim() || !dateOk) return;
    onSubmit({
      proceedsEur: preview.proceedsEur,
      portal: portal.trim(),
      feeEur: preview.feeEur,
      shippingEur: preview.shippingEur,
      paymentMethod: paymentMethod.trim() || null,
      soldOn,
      buyer: buyer.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 space-y-1">
          <span className="block text-micro uppercase text-ink-faint">Verkaufspreis €</span>
          <input
            type="text"
            inputMode="decimal"
            value={proceedsValue}
            onChange={(e) => {
              setProceedsTouched(true);
              setProceeds(e.target.value);
            }}
            className={inputClass}
            autoFocus
          />
        </label>
        <label className="space-y-1">
          <span className="block text-micro uppercase text-ink-faint">Kanal</span>
          <select
            value={portal}
            onChange={(e) => setPortal(e.target.value)}
            className={inputClass}
          >
            {portals.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-micro uppercase text-ink-faint">Datum</span>
          <input
            type="date"
            value={soldOn}
            min="2000-01-01"
            max={shiftIso(todayIso(), 1)}
            onChange={(e) => setSoldOn(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <details className="rounded-control border border-line">
        <summary className="cursor-pointer list-none px-3 py-2 text-label text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          Gebühren, Versand, Käufer — optional
        </summary>
        <div className="px-3 pb-3 space-y-2">
          <p className="text-micro text-ink-faint">0 €, wenn nichts angefallen ist.</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="block text-micro uppercase text-ink-faint">Gebühren €</span>
              <input
                type="text"
                inputMode="decimal"
                value={feeValue}
                onChange={(e) => {
                  setFeeTouched(true);
                  setFee(e.target.value);
                }}
                className={inputClass}
              />
            </label>
            <label className="space-y-1">
              <span className="block text-micro uppercase text-ink-faint">Versand €</span>
              <input
                type="text"
                inputMode="decimal"
                value={shippingValue}
                onChange={(e) => {
                  setShippingTouched(true);
                  setShipping(e.target.value);
                }}
                className={inputClass}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="block text-micro uppercase text-ink-faint">Käufer</span>
            <input
              type="text"
              value={buyer}
              maxLength={120}
              onChange={(e) => setBuyer(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="block text-micro uppercase text-ink-faint">Notiz</span>
            <input
              type="text"
              value={notes}
              maxLength={2000}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="block text-micro uppercase text-ink-faint">Zahlungsweg</span>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className={inputClass}
            >
              <option value="">optional</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>

      <div aria-live="polite">
        {preview && (
          <div className="text-label font-normal text-ink space-y-1 tabular-nums">
            <p>
              Gebühren {formatEur(preview.feeEur)} · Versand {formatEur(preview.shippingEur)}
              {showProfit && (
                <>
                  {' '}
                  · Gewinn{' '}
                  <span className={preview.netProfitEur != null && preview.netProfitEur < 0 ? 'text-danger font-bold' : 'font-bold'}>
                    {formatEur(preview.netProfitEur)}
                  </span>
                </>
              )}
            </p>
            {showProfit && purchasePriceEur == null && (
              <p className="text-ink-muted">Einkaufspreis fehlt — Gewinn erst, wenn er erfasst ist.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button size="sm" loading={busy} disabled={busy || !preview || !portal.trim() || !dateOk} onClick={submit}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            Abbrechen
          </Button>
        )}
      </div>
    </div>
  );
}
