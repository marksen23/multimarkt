import { useState } from 'react';
import { dispositionApi } from '../api/disposition';
import type { DispositionRecommendation, DispositionUserGoal } from '../api/disposition';
import { ApiRequestError } from '../api/client';

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
export function DispositionPanel({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('household');
  const [marketMedianPrice, setMarketMedianPrice] = useState('');
  const [isBulky, setIsBulky] = useState(false);
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
        min="0"
        step="0.01"
        placeholder="Geschätzter Marktpreis (€)"
        value={marketMedianPrice}
        onChange={(e) => setMarketMedianPrice(e.target.value)}
        className="w-full p-2 border border-line rounded-lg text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition"
      />
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <input type="checkbox" checked={isBulky} onChange={(e) => setIsBulky(e.target.checked)} />
        Sperrig (nur Abholung möglich)
      </label>

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
          {result.recommendedPlatforms.length > 0 && (
            <div className="space-y-1">
              {result.recommendedPlatforms.map((p) => (
                <div
                  key={p.key}
                  className="flex items-center justify-between bg-surface-hover rounded-lg p-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-ink">{p.key}</span>
                    <p className="text-ink-faint">{p.reasoning}</p>
                  </div>
                  <span className="font-bold text-accent">
                    ~{p.netExpectedValue.toFixed(2)} €
                  </span>
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
