import { useState } from 'react';
import {
  computeExpectedMargin,
  NOT_INDIVIDUAL_SALE_NOTICE,
  type MarginAssumptions,
} from '../margin/expected-margin';
import { persistMarginAssumptions, useMarginAssumptions } from '../margin/use-margin-assumptions';

function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '' || normalized === '.') return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

function euros(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(2)} €`;
}

/**
 * Neben dem Preisvorschlag: Gebühr (Prozentsatz), Versand, erwarteter
 * Netto, Marge in Euro und Prozent. Unter der gesetzten Schwelle
 * „nicht einzeln verkaufen“.
 */
export function ExpectedMarginFields({
  salePriceEur,
  purchasePriceEur,
  salePriceLabel,
}: {
  salePriceEur: number | null;
  purchasePriceEur: number | null;
  salePriceLabel: string;
}) {
  const assumptions = useMarginAssumptions();
  const [feeOverride, setFeeOverride] = useState<string | null>(null);
  const [shippingOverride, setShippingOverride] = useState<string | null>(null);
  const [thresholdOverride, setThresholdOverride] = useState<string | null>(null);

  const feeRaw = feeOverride ?? (assumptions ? String(assumptions.feePercent) : '');
  const shippingRaw = shippingOverride ?? (assumptions ? String(assumptions.shippingEur) : '');
  const thresholdRaw =
    thresholdOverride ??
    (assumptions?.singleSaleThresholdEur == null ? '' : String(assumptions.singleSaleThresholdEur));

  const draft = readDraft(feeRaw, shippingRaw, thresholdRaw);

  const commit = (nextFee: string, nextShipping: string, nextThreshold: string) => {
    const next = readDraft(nextFee, nextShipping, nextThreshold);
    if (next) void persistMarginAssumptions(next);
  };

  const margin =
    draft && salePriceEur != null
      ? computeExpectedMargin({
          salePriceEur,
          purchasePriceEur,
          ...draft,
        })
      : null;

  if (!assumptions) {
    return <p className="text-xs text-ink-faint">Marge lädt…</p>;
  }

  return (
    <div className="bg-surface border border-line rounded-xl p-3 space-y-2">
      <p className="text-xs font-bold text-ink-muted uppercase tracking-wide">Erwartete Marge</p>
      <p className="text-[11px] text-ink-faint">
        Annahmen, die du pflegst
        {salePriceEur != null ? ` — bezogen auf den ${salePriceLabel} ${salePriceEur.toFixed(2)} €.` : '.'}{' '}
        Einstand {purchasePriceEur == null ? 'fehlt' : `${purchasePriceEur.toFixed(2)} €`}.
      </p>

      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className="block text-[10px] font-bold text-ink-faint uppercase">Gebühr %</span>
          <input
            type="text"
            inputMode="decimal"
            value={feeRaw}
            onChange={(e) => {
              setFeeOverride(e.target.value);
              commit(e.target.value, shippingRaw, thresholdRaw);
            }}
            className="w-full p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[10px] font-bold text-ink-faint uppercase">Versand €</span>
          <input
            type="text"
            inputMode="decimal"
            value={shippingRaw}
            onChange={(e) => {
              setShippingOverride(e.target.value);
              commit(feeRaw, e.target.value, thresholdRaw);
            }}
            className="w-full p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[10px] font-bold text-ink-faint uppercase">Schwelle €</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="—"
            value={thresholdRaw}
            onChange={(e) => {
              setThresholdOverride(e.target.value);
              commit(feeRaw, shippingRaw, e.target.value);
            }}
            className="w-full p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
          />
        </label>
      </div>
      <p className="text-[10px] text-ink-faint">
        Schwelle ist die Mindestmarge in Euro. Darunter: nicht einzeln verkaufen.
      </p>

      {margin && (
        <div className="grid grid-cols-2 gap-2 text-center">
          <Figure label="Gebühr" value={euros(margin.feeEur)} />
          <Figure label="Erwarteter Netto" value={euros(margin.expectedNetEur)} />
          <Figure label="Marge" value={euros(margin.marginEur)} />
          <Figure
            label="Marge %"
            value={margin.marginPercent == null ? '—' : `${margin.marginPercent.toFixed(2)} %`}
          />
        </div>
      )}

      {purchasePriceEur == null && (
        <p className="text-[11px] text-ink-muted">
          Einstand fehlt — Marge in Euro und Prozent erst nach dem Einkauf.
        </p>
      )}

      {margin?.belowSingleSaleThreshold && (
        <p className="text-sm font-bold text-danger">{NOT_INDIVIDUAL_SALE_NOTICE}</p>
      )}
    </div>
  );
}

function readDraft(feeRaw: string, shippingRaw: string, thresholdRaw: string): MarginAssumptions | null {
  const feePercent = feeRaw.trim() === '' ? 0 : parseAmount(feeRaw);
  const shippingEur = shippingRaw.trim() === '' ? 0 : parseAmount(shippingRaw);
  const singleSaleThresholdEur = thresholdRaw.trim() === '' ? null : parseAmount(thresholdRaw);
  const thresholdOk = thresholdRaw.trim() === '' || singleSaleThresholdEur != null;
  if (feePercent == null || feePercent > 100 || shippingEur == null || !thresholdOk) return null;
  return { feePercent, shippingEur, singleSaleThresholdEur };
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-ink-faint uppercase font-bold">{label}</p>
      <p className="font-bold text-ink text-sm">{value}</p>
    </div>
  );
}
