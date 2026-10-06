import { useState } from 'react';
import { shippingCostEur, shippingPortalsAllowed, type LogisticsProfile } from '../logistics/profile';
import {
  CHANNEL_FEE_LABELS,
  CHANNEL_NET_LABELS,
  compareChannelsByNet,
  comparisonShippingEur,
  SELLING_CHANNEL_KEYS,
  type ChannelFeeAssumptions,
  type ChannelFeeRate,
  type SellingChannelKey,
} from '../margin/channel-fees';
import { persistMarginAssumptions, useMarginAssumptions } from '../margin/use-margin-assumptions';

function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '' || normalized === '.') return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

function parseRate(percentRaw: string, fixedRaw: string): ChannelFeeRate | null {
  const percent = percentRaw.trim() === '' ? 0 : parseAmount(percentRaw);
  const fixedEur = fixedRaw.trim() === '' ? 0 : parseAmount(fixedRaw);
  if (percent == null || percent > 100 || fixedEur == null) return null;
  return { percent, fixedEur };
}

/**
 * Annahmen je Kanal (Feature-Plan 3.10). Eine Zeile:
 * „bei Verkauf zu diesem Preis bleiben X €“, sortiert nach diesem Netto.
 * Die Versandpauschale ist dieselbe Annahme wie in der erwarteten Marge.
 */
export function ChannelNetComparison({
  salePriceEur,
  salePriceLabel,
  logistics,
}: {
  salePriceEur: number | null;
  salePriceLabel: string;
  logistics?: LogisticsProfile | null;
}) {
  const assumptions = useMarginAssumptions();
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  if (!assumptions) {
    return <p className="text-xs text-ink-faint">Gebührenannahmen laden…</p>;
  }

  const channels = assumptions.channels;
  const shippingRaw = overrides.shipping ?? String(assumptions.shippingEur);
  const draft = readDraft(channels, overrides, shippingRaw);
  const parcelEur = logistics ? shippingCostEur(logistics) : 0;
  const shippingAllowed = logistics ? shippingPortalsAllowed(logistics) : true;
  const netShippingEur = draft
    ? comparisonShippingEur({
        shippingAllowed,
        parcelEur,
        flatEur: draft.shippingEur,
      })
    : 0;
  const lines =
    draft && salePriceEur != null
      ? compareChannelsByNet({
          salePriceEur,
          channels: draft.channels,
          shippingEur: netShippingEur,
        })
      : null;

  const edit = (key: string, value: string) => {
    const nextOverrides = { ...overrides, [key]: value };
    setOverrides(nextOverrides);
    const next = readDraft(channels, nextOverrides, nextOverrides.shipping ?? shippingRaw);
    if (!next) return;
    void persistMarginAssumptions({
      ...assumptions,
      shippingEur: next.shippingEur,
      channels: next.channels,
    });
  };

  return (
    <div className="bg-surface border border-line rounded-xl p-3 space-y-2">
      <p className="text-xs font-bold text-ink-muted uppercase tracking-wide">Gebührenvergleich</p>
      <p className="text-[11px] text-ink-faint">
        Annahmen, keine aktuellen Tarife. Gebühren ändern sich.
        {salePriceEur != null ? ` Bezogen auf den ${salePriceLabel} ${salePriceEur.toFixed(2)} €.` : ''}
      </p>

      <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr] gap-2 text-[10px] font-bold text-ink-faint uppercase">
        <span>Kanal</span>
        <span>Prozent</span>
        <span>Fixkosten €</span>
      </div>

      {SELLING_CHANNEL_KEYS.map((key) => (
        <ChannelFeeRow
          key={key}
          channel={key}
          percent={overrides[`${key}-percent`] ?? String(channels[key].percent)}
          fixed={overrides[`${key}-fixed`] ?? String(channels[key].fixedEur)}
          onPercent={(value) => edit(`${key}-percent`, value)}
          onFixed={(value) => edit(`${key}-fixed`, value)}
        />
      ))}

      <label className="grid grid-cols-[1.4fr_0.8fr_0.8fr] gap-2 items-center">
        <span className="text-xs text-ink">Versandpauschale</span>
        <span className="text-[10px] text-ink-faint">—</span>
        <input
          aria-label="Versandpauschale"
          type="text"
          inputMode="decimal"
          value={shippingRaw}
          onChange={(e) => edit('shipping', e.target.value)}
          className="w-full p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
        />
      </label>

      {lines && (
        <div className="space-y-1 pt-1 border-t border-line">
          {lines.map((line) => (
            <p key={line.key} className="text-xs text-ink">
              <span className="font-bold">{CHANNEL_NET_LABELS[line.key]}:</span> {line.line}
            </p>
          ))}
          <p className="text-[10px] text-ink-faint">
            Sortiert nach diesem Netto, nicht nach dem Angebotsmedian.{' '}
            {shippingNote(shippingAllowed, draft?.shippingEur ?? 0, parcelEur, netShippingEur)}
          </p>
        </div>
      )}
    </div>
  );
}

function ChannelFeeRow({
  channel,
  percent,
  fixed,
  onPercent,
  onFixed,
}: {
  channel: SellingChannelKey;
  percent: string;
  fixed: string;
  onPercent: (value: string) => void;
  onFixed: (value: string) => void;
}) {
  const label = CHANNEL_FEE_LABELS[channel];
  return (
    <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr] gap-2 items-center">
      <span className="text-xs text-ink">{label}</span>
      <input
        aria-label={`${label} Prozent`}
        type="text"
        inputMode="decimal"
        value={percent}
        onChange={(e) => onPercent(e.target.value)}
        className="w-full p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
      />
      <input
        aria-label={`${label} Fixkosten`}
        type="text"
        inputMode="decimal"
        value={fixed}
        onChange={(e) => onFixed(e.target.value)}
        className="w-full p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
      />
    </div>
  );
}

function shippingNote(
  shippingAllowed: boolean,
  flatEur: number,
  parcelEur: number,
  usedEur: number,
): string {
  if (!shippingAllowed) return 'Nur Abholung, die Versandpauschale wird nicht abgezogen.';
  if (flatEur > 0) return `Versandpauschale ${usedEur.toFixed(2)} € ist eine Annahme.`;
  if (parcelEur > 0) {
    return `Versand ${usedEur.toFixed(2)} € aus dem Logistikprofil, solange die Versandpauschale 0 € ist.`;
  }
  return 'Ohne Versandabzug.';
}

function readDraft(
  saved: ChannelFeeAssumptions,
  overrides: Record<string, string>,
  shippingRaw: string,
): { channels: ChannelFeeAssumptions; shippingEur: number } | null {
  const channels: ChannelFeeAssumptions = {
    KLEINANZEIGEN: saved.KLEINANZEIGEN,
    EBAY: saved.EBAY,
    VINTED: saved.VINTED,
  };
  for (const key of SELLING_CHANNEL_KEYS) {
    const parsed = parseRate(
      overrides[`${key}-percent`] ?? String(saved[key].percent),
      overrides[`${key}-fixed`] ?? String(saved[key].fixedEur),
    );
    if (!parsed) return null;
    channels[key] = parsed;
  }
  const shippingEur = shippingRaw.trim() === '' ? 0 : parseAmount(shippingRaw);
  if (shippingEur == null) return null;
  return { channels, shippingEur };
}
