import { useState } from 'react';
import { dispositionApi } from '../api/disposition';
import type { DispositionRecommendation, DispositionUserGoal } from '../api/disposition';
import { ApiRequestError } from '../api/client';
import { shippingCostEur, shippingPortalsAllowed, type LogisticsProfile } from '../logistics/profile';
import { RESALE_CATEGORIES, resolveCategory } from '../category/taxonomy';
import { flushMarginAssumptions } from '../margin/use-margin-assumptions';
import { ChannelNetComparison } from './ChannelNetComparison';

const USER_GOALS: { value: DispositionUserGoal; label: string }[] = [
  { value: 'BALANCED', label: 'Ausgewogen' },
  { value: 'MAX_PROFIT', label: 'Maximaler Erlös' },
  { value: 'FAST_SALE', label: 'Schneller Verkauf' },
  { value: 'MINIMAL_EFFORT', label: 'Minimaler Aufwand' },
];

const ACTION_LABELS: Record<string, string> = {
  SELL_ONLINE: 'Online verkaufen',
  LOCAL_PICKUP_ONLY: 'Nur lokale Abholung',
  DONATE: 'Spenden empfohlen',
  DISCARD: 'Entsorgen empfohlen',
  BUYBACK_SERVICE: 'Ankaufsdienst nutzen',
};

const PLATFORM_LABELS: Record<string, string> = {
  KLEINANZEIGEN: 'Kleinanzeigen',
  EBAY: 'eBay',
  VINTED: 'Vinted',
  BUYBACK_SERVICE: 'Ankauf',
};

const SELLING_CHANNEL_KEYS = new Set(['KLEINANZEIGEN', 'EBAY', 'VINTED']);

const ACTION_COLORS: Record<string, string> = {
  SELL_ONLINE: 'bg-accent-soft text-accent',
  LOCAL_PICKUP_ONLY: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  DONATE: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  DISCARD: 'bg-zinc-500/10 text-zinc-500',
  BUYBACK_SERVICE: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
};

/**
 * "Lohnt sich das?" (Freeze §10, Disposition Engine). Reine Empfehlung —
 * das Backend persistiert bewusst keine gewählte Strategie (siehe
 * items.controller.ts: keine `target_strategy`-Spalte im eingefrorenen
 * Schema). Diese Komponente ist deshalb ein Rechner, kein Formular mit
 * Speicherzustand.
 */
export function DispositionPanel({
  itemId,
  logistics,
  itemCategory,
}: {
  itemId: string;
  logistics: LogisticsProfile;
  itemCategory?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(resolveCategory(itemCategory) ?? 'Haushalt');
  const [marketMedianPrice, setMarketMedianPrice] = useState('');
  const [userGoal, setUserGoal] = useState<DispositionUserGoal>('BALANCED');
  const [result, setResult] = useState<DispositionRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const logisticsKey = [
    logistics.captured,
    logistics.weightGrams,
    logistics.lengthCm,
    logistics.widthCm,
    logistics.heightCm,
    logistics.bulky,
    logistics.pickupOnly,
    logistics.shippingPossible,
    logistics.postalCode,
  ].join('|');
  const [seenLogisticsKey, setSeenLogisticsKey] = useState(logisticsKey);
  if (seenLogisticsKey !== logisticsKey) {
    setSeenLogisticsKey(logisticsKey);
    setResult(null);
  }

  const evaluate = async () => {
    setBusy(true);
    setError(null);
    try {
      await flushMarginAssumptions();
      setResult(
        await dispositionApi.evaluate(itemId, {
          category,
          marketMedianPrice: Number(marketMedianPrice),
          userGoal,
        }),
      );
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full p-3 rounded-xl border border-line text-sm font-bold text-ink-muted hover:bg-surface-hover transition-colors"
      >
        Lohnt sich der Verkauf? — Disposition-Check
      </button>
    );
  }

  return (
    <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-ink-muted uppercase">Disposition-Check</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-faint hover:text-ink-muted">
          Schließen
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="p-2 border border-line rounded-lg text-xs bg-surface text-ink"
        >
          {RESALE_CATEGORIES.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <select
          value={userGoal}
          onChange={(e) => setUserGoal(e.target.value as DispositionUserGoal)}
          className="p-2 border border-line rounded-lg text-xs bg-surface text-ink"
        >
          {USER_GOALS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </div>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        placeholder="Geschätzter Marktpreis (€)"
        value={marketMedianPrice}
        onChange={(e) => setMarketMedianPrice(e.target.value)}
        className="w-full p-2 border border-line rounded-lg text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition"
      />
      <p className="text-xs text-ink-muted">{logisticsSummary(logistics)}</p>
      <ChannelNetComparison salePriceEur={null} salePriceLabel="Marktpreis" logistics={logistics} />

      {error && <p className="text-xs text-danger">{error}</p>}

      <button
        type="button"
        disabled={busy || !marketMedianPrice}
        onClick={evaluate}
        className="w-full p-2 rounded-lg bg-accent text-accent-ink text-sm font-bold hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
      >
        {busy ? 'Berechnet…' : 'Berechnen'}
      </button>

      {result && (
        <div className="space-y-2 pt-2 border-t border-line">
          <span
            className={`inline-block px-2 py-1 rounded-lg text-xs font-bold ${ACTION_COLORS[result.action] ?? 'bg-zinc-500/10 text-zinc-500'}`}
          >
            {ACTION_LABELS[result.action] ?? result.action}
          </span>
          <p className="text-xs text-ink-muted">{result.rationale}</p>
          {result.margin && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <p className="text-ink-muted">
                Gebühr {result.margin.feePercent.toFixed(2)} % · {result.margin.feeEur.toFixed(2)} €
              </p>
              <p className="text-ink-muted">Versand {result.margin.shippingEur.toFixed(2)} €</p>
              <p className="text-ink">
                Erwarteter Netto <span className="font-bold">{result.margin.expectedNetEur.toFixed(2)} €</span>
              </p>
              <p className="text-ink">
                Marge{' '}
                <span className="font-bold">
                  {result.margin.marginEur == null
                    ? '—'
                    : `${result.margin.marginEur.toFixed(2)} €`}
                  {result.margin.marginPercent != null
                    ? ` (${result.margin.marginPercent.toFixed(2)} %)`
                    : ''}
                </span>
              </p>
            </div>
          )}
          {result.individualSaleNotice && (
            <p className="text-sm font-bold text-danger">{result.individualSaleNotice}</p>
          )}
          {result.recommendedPlatforms.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] text-ink-faint">
                Annahmen. Gebühren ändern sich. Reihenfolge nach dem Netto, nicht nach dem Angebotsmedian.
              </p>
              {result.recommendedPlatforms.map((p) => (
                <div key={p.key} className="bg-surface-hover rounded-lg p-2 text-xs space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink">{PLATFORM_LABELS[p.key] ?? p.key}</span>
                    {!SELLING_CHANNEL_KEYS.has(p.key) && (
                      <span className="font-bold text-accent">~{p.netExpectedValue.toFixed(2)} €</span>
                    )}
                  </div>
                  {SELLING_CHANNEL_KEYS.has(p.key) && (
                    <p className="text-ink">
                      bei Verkauf zu diesem Preis bleiben{' '}
                      <span className="font-bold">{p.netExpectedValue.toFixed(2)} €</span>
                    </p>
                  )}
                  {p.feePercent != null && p.feeFixedEur != null && (
                    <p className="text-ink-faint">
                      Annahme {p.feePercent.toFixed(2)} % + {p.feeFixedEur.toFixed(2)} €
                      {p.shippingEur > 0
                        ? `, Versand ${p.shippingEur.toFixed(2)} €`
                        : ', ohne Versandabzug'}
                    </p>
                  )}
                  <p className="text-ink-faint">{p.reasoning}</p>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-ink-faint">
            Geschätzter Aufwand: {result.estimatedEffortMinutes} Min.
          </p>
        </div>
      )}
    </div>
  );
}

function logisticsSummary(profile: LogisticsProfile): string {
  if (!profile.captured) {
    return 'Logistikprofil fehlt. Versandportale bleiben zu, keine Versandpauschale.';
  }
  if (shippingPortalsAllowed(profile)) {
    return `Versand möglich. Paketkosten ${shippingCostEur(profile).toFixed(2)} € aus Gewicht und Maßen.`;
  }
  const postalCode = profile.postalCode ? ` PLZ ${profile.postalCode}.` : '';
  return `Nur Abholung.${postalCode} Keine Versandportale.`;
}
