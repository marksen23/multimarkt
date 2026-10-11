import { useEffect, useState } from 'react';
import { dispositionApi } from '../api/disposition';
import type { DispositionRecommendation, DispositionUserGoal } from '../api/disposition';
import { ApiRequestError } from '../api/client';
import { itemsApi } from '../api/items';
import { Button, Card, inputClass } from '../ui';

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

/**
 * "Lohnt sich das?" (Freeze §10, Disposition Engine). Reine Empfehlung —
 * das Backend persistiert bewusst keine gewählte Strategie (siehe
 * items.controller.ts: keine `target_strategy`-Spalte im eingefrorenen
 * Schema). Diese Komponente ist deshalb ein Rechner, kein Formular mit
 * Speicherzustand.
 */
export function DispositionPanel({ itemId, initialMedian }: { itemId: string; initialMedian?: number | null }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('household');
  const [marketMedianPrice, setMarketMedianPrice] = useState(
    initialMedian != null ? initialMedian.toFixed(2) : '',
  );
  const [isBulky, setIsBulky] = useState(false);

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

  const evaluate = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await dispositionApi.evaluate(itemId, {
          category,
          marketMedianPrice: Number(marketMedianPrice),
          isBulky,
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
          onChange={(e) => setCategory(e.target.value)}
          className={inputClass}
        >
          <option value="household">Haushalt</option>
          <option value="fashion">Mode</option>
          <option value="shoes">Schuhe</option>
          <option value="electronics">Elektronik</option>
          <option value="books">Bücher</option>
          <option value="media">Medien</option>
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
      <label className="flex items-center gap-2 text-label font-normal text-ink-muted">
        <input type="checkbox" checked={isBulky} onChange={(e) => setIsBulky(e.target.checked)} />
        Sperrig (nur Abholung möglich)
      </label>

      {error && <p className="text-label text-danger">{error}</p>}

      <Button block loading={busy} disabled={busy || !marketMedianPrice} onClick={evaluate}>
        {busy ? 'Berechnet…' : 'Berechnen'}
      </Button>

      {result && (
        <div className="space-y-2 pt-2 border-t border-line">
          <span
            className={`inline-block px-2 py-1 rounded-control text-label font-bold ${ACTION_COLORS[result.action] ?? ACTION_COLOR_FALLBACK}`}
          >
            {ACTION_LABELS[result.action] ?? result.action}
          </span>
          <p className="text-label font-normal text-ink-muted">{result.rationale}</p>
          {result.recommendedPlatforms.length > 0 && (
            <div className="space-y-1">
              {result.recommendedPlatforms.map((p) => (
                <div
                  key={p.key}
                  className="flex items-center justify-between gap-2 bg-surface-hover rounded-control p-2 text-label font-normal"
                >
                  <div>
                    <span className="font-bold text-ink">{PLATFORM_LABELS[p.key] ?? p.key}</span>
                    <p className="text-ink-faint">{p.reasoning}</p>
                  </div>
                  <span className="font-bold text-accent tabular-nums shrink-0">
                    ~{p.netExpectedValue.toFixed(2)} €
                  </span>
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
