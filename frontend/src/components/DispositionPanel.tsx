import { useEffect, useState } from 'react';
import { dispositionApi } from '../api/disposition';
import type { DispositionRecommendation, DispositionUserGoal } from '../api/disposition';
import { ApiRequestError } from '../api/client';
import { itemsApi } from '../api/items';
import { RESALE_CATEGORIES, resolveCategory, type ResaleCategory } from '../category/taxonomy';
import { shippingCostEur, shippingPortalsAllowed, type LogisticsProfile } from '../logistics/profile';
import { flushMarginAssumptions } from '../margin/use-margin-assumptions';
import { Button, Card, Notice, inputClass } from '../ui';
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
  FACEBOOK: 'Facebook',
  ANKAUF: 'Ankauf-Dienst',
};

const ACTION_COLORS: Record<string, string> = {
  SELL_ONLINE: 'bg-accent-soft text-accent',
  LOCAL_PICKUP_ONLY: 'bg-phase-capture-soft text-phase-capture',
  DONATE: 'bg-warning-soft text-warning',
  DISCARD: 'bg-phase-archive-soft text-phase-archive',
  BUYBACK_SERVICE: 'bg-phase-live-soft text-phase-live',
};

const ACTION_COLOR_FALLBACK = 'bg-phase-archive-soft text-phase-archive';
const SELLING_CHANNEL_KEYS = new Set(['KLEINANZEIGEN', 'EBAY', 'VINTED']);
const EMPTY_LOGISTICS: LogisticsProfile = {
  captured: false,
  weightGrams: null,
  lengthCm: null,
  widthCm: null,
  heightCm: null,
  bulky: false,
  pickupOnly: false,
  shippingPossible: false,
  postalCode: null,
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
  initialMedian,
  logistics = EMPTY_LOGISTICS,
  itemCategory,
}: {
  itemId: string;
  initialMedian?: number | null;
  logistics?: LogisticsProfile;
  itemCategory?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(resolveCategory(itemCategory) ?? 'Haushalt');
  const [marketMedianPrice, setMarketMedianPrice] = useState(
    initialMedian != null ? initialMedian.toFixed(2) : '',
  );
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
  useEffect(() => {
    if (initialMedian != null && !marketMedianPrice) {
      setMarketMedianPrice(initialMedian.toFixed(2));
    }
    // Only pre-fill once when the median arrives — don't overwrite manual edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMedian]);
  const [userGoal, setUserGoal] = useState<DispositionUserGoal>('BALANCED');
  const [result, setResult] = useState<DispositionRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  const openPanel = async () => {
    setOpen(true);
    if (marketMedianPrice !== '') return;
    try {
      const research = await itemsApi.priceResearch(itemId);
      const suggested =
        research.recommendation?.listPrice ??
        (() => {
          const medians = research.sources.map((s) => s.median).filter((m): m is number => m !== null);
          return medians.length ? Math.round(medians.reduce((a, b) => a + b, 0) / medians.length) : null;
        })();
      if (suggested !== null) setMarketMedianPrice(String(suggested));
    } catch {
      // silently ignore — user can type manually
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => void openPanel()}
        className="w-full p-3 rounded-control border border-line text-body font-bold text-ink-muted hover:bg-surface-hover transition-colors flex items-center justify-between gap-2"
      >
        <span>Lohnt sich der Verkauf? — Disposition-Check</span>
        {result && (
          <span className={`text-micro px-2 py-0.5 rounded-full shrink-0 ${ACTION_COLORS[result.action] ?? ACTION_COLOR_FALLBACK}`}>
            {ACTION_LABELS[result.action] ?? result.action}
          </span>
        )}
      </button>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-micro uppercase text-ink-muted">Disposition-Check</p>
        <button type="button" onClick={() => setOpen(false)} className="text-label font-normal text-ink-faint hover:text-ink-muted">
          Schließen
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ResaleCategory)}
          className={inputClass}
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
          className={inputClass}
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
        className={inputClass}
      />
      <p className="text-label font-normal text-ink-muted">{logisticsSummary(logistics)}</p>
      <ChannelNetComparison salePriceEur={null} salePriceLabel="Marktpreis" logistics={logistics} />

      {error && <Notice tone="danger">{error}</Notice>}

      <Button block loading={busy} disabled={busy || !marketMedianPrice} onClick={evaluate}>
        Berechnen
      </Button>

      {result && (
        <div className="space-y-2 pt-2 border-t border-line">
          <span
            className={`inline-block px-2 py-1 rounded-control text-label font-bold ${ACTION_COLORS[result.action] ?? ACTION_COLOR_FALLBACK}`}
          >
            {ACTION_LABELS[result.action] ?? result.action}
          </span>
          <p className="text-label font-normal text-ink-muted">{result.rationale}</p>
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
                  {result.margin.marginEur == null ? '—' : `${result.margin.marginEur.toFixed(2)} €`}
                  {result.margin.marginPercent != null ? ` (${result.margin.marginPercent.toFixed(2)} %)` : ''}
                </span>
              </p>
            </div>
          )}
          {result.individualSaleNotice && (
            <p className="text-sm font-bold text-danger">{result.individualSaleNotice}</p>
          )}
          {result.recommendedPlatforms.length > 0 && (
            <div className="space-y-1">
              <p className="text-label font-normal text-ink-faint">
                Annahmen. Gebühren ändern sich. Reihenfolge nach dem Netto, nicht nach dem Angebotsmedian.
              </p>
              {result.recommendedPlatforms.map((p) => (
                <div key={p.key} className="bg-surface-hover rounded-control p-2 text-label font-normal space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink">{PLATFORM_LABELS[p.key] ?? p.key}</span>
                    {!SELLING_CHANNEL_KEYS.has(p.key) && (
                      <span className="font-bold text-accent tabular-nums">~{p.netExpectedValue.toFixed(2)} €</span>
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
                      {p.shippingEur > 0 ? `, Versand ${p.shippingEur.toFixed(2)} €` : ', ohne Versandabzug'}
                    </p>
                  )}
                  <p className="text-ink-faint">{p.reasoning}</p>
                </div>
              ))}
            </div>
          )}
          <p className="text-label font-normal text-ink-faint">
            Geschätzter Aufwand: {result.estimatedEffortMinutes} Min.
          </p>
        </div>
      )}
    </Card>
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
