import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bundlesApi } from '../api/bundles';
import { ApiRequestError } from '../api/client';
import type { BundleSuggestion, BundleSuggestionList } from '../api/types';
import { formatEur } from '../margin/sale-closeout';

/**
 * Paketvorschläge (Feature-Plan 3.8). Übernehmen legt ein normales Bundle
 * an. Verwerfen blendet genau diesen Treffer aus. Das manuelle Bündeln
 * bleibt daneben.
 */
export function BundleSuggestions() {
  const [list, setList] = useState<BundleSuggestionList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    bundlesApi
      .suggestions()
      .then(setList)
      .catch((e) => setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler'));
  }, []);

  const run = async (fingerprint: string, action: 'accept' | 'dismiss') => {
    setBusyId(fingerprint);
    setError(null);
    try {
      if (action === 'dismiss') {
        await bundlesApi.dismissSuggestion(fingerprint);
        setList((current) =>
          current
            ? {
                ...current,
                suggestions: current.suggestions.filter((entry) => entry.fingerprint !== fingerprint),
              }
            : current,
        );
        return;
      }
      const suggestion = list?.suggestions.find((entry) => entry.fingerprint === fingerprint);
      const bundle = await bundlesApi.acceptSuggestion(fingerprint);
      const price = suggestion ? suggestion.suggestedPriceEur.toFixed(2) : '';
      navigate(price ? `/bundles/${bundle.id}?preis=${encodeURIComponent(price)}` : `/bundles/${bundle.id}`);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="bg-surface border border-line rounded-2xl p-4 space-y-3">
      <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Vorschläge</h2>
      {error && <p className="text-xs text-danger">{error}</p>}
      {!list && !error && <p className="text-xs text-ink-faint">Vorschläge werden gesucht…</p>}
      {list && list.thresholdEur == null && (
        <p className="text-sm text-ink-muted">
          Lege unter Erwartete Marge eine Schwelle fest. Darunter schlägt die App Pakete vor, wenn
          mehrere Artikel dieselbe Kategorie, Größe oder Marke haben.
        </p>
      )}
      {list && list.thresholdEur != null && list.suggestions.length === 0 && (
        <p className="text-sm text-ink-muted">
          Keine Vorschläge. Mehrere bereite Artikel mit derselben Kategorie, Größe oder Marke, deren
          Einzelmarge unter {formatEur(list.thresholdEur)} liegt, erscheinen hier.
        </p>
      )}
      <div className="space-y-3">
        {list?.suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.fingerprint}
            suggestion={suggestion}
            busy={busyId === suggestion.fingerprint}
            disabled={busyId != null}
            onAccept={() => void run(suggestion.fingerprint, 'accept')}
            onDismiss={() => void run(suggestion.fingerprint, 'dismiss')}
          />
        ))}
      </div>
    </section>
  );
}

function SuggestionCard({
  suggestion,
  busy,
  disabled,
  onAccept,
  onDismiss,
}: {
  suggestion: BundleSuggestion;
  busy: boolean;
  disabled: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <article className="border border-accent/30 bg-accent-soft/40 rounded-xl p-3 space-y-2">
      <p className="font-bold text-ink text-sm">{suggestion.title}</p>
      <p className="text-xs text-ink-muted">{suggestion.description}</p>
      <ul className="space-y-1">
        {suggestion.items.map((item) => (
          <li key={item.id} className="text-xs text-ink flex justify-between gap-3">
            <span>{item.title ?? `Artikel ${item.id.slice(0, 8)}`}</span>
            <span className="text-ink-faint shrink-0">Einzelmarge {formatEur(item.marginEur)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink">
        Abholpreis <span className="font-bold">{formatEur(suggestion.suggestedPriceEur)}</span>
        {' · '}
        Marge <span className="font-bold">{formatEur(suggestion.bundleMarginEur)}</span>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onAccept}
          className="px-3 py-1.5 rounded-full bg-accent text-accent-ink text-xs font-bold hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
        >
          {busy ? 'Bitte warten…' : 'Übernehmen'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onDismiss}
          className="px-3 py-1.5 rounded-full bg-surface text-ink-muted text-xs font-bold border border-line hover:bg-surface-hover disabled:text-ink-faint transition-colors"
        >
          Verwerfen
        </button>
      </div>
    </article>
  );
}
