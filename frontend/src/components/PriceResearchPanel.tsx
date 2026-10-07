import { useEffect, useState } from 'react';
import { itemsApi } from '../api/items';
import type { PriceRecommendation, PriceResearchResult, PriceResearchSourceResult, SalesGoal } from '../api/types';
import { SkeletonBlock } from './Skeleton';

/**
 * §9d/§9e: Preisvorschläge sind rein beratend, nie automatisch übernommen —
 * "Median übernehmen" befüllt das Preisfeld erst nach explizitem Klick.
 * Jede Quelle bleibt einzeln sichtbar und gelabelt, nie zu einer Zahl
 * vermischt. Der abgeleitete Vorschlag (P_list/P_target/P_min) ist eine
 * ZUSÄTZLICHE, transparent begründete Zusammenfassung — ersetzt die
 * Einzelquellen-Ansicht nicht (siehe PriceRecommendationService-Doku).
 */
const SOURCE_LABELS: Record<string, string> = {
  EBAY_ACTIVE_LISTINGS: 'eBay – aktive Angebote',
  ANKAUF_PORTAL: 'Ankaufportal-Richtwert',
  GEMINI_GROUNDING: 'Gemini – Websuche',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  LOW: 'Niedrige Konfidenz',
  MEDIUM: 'Mittlere Konfidenz',
  HIGH: 'Hohe Konfidenz',
};

export function PriceResearchPanel({
  itemId,
  onSuggestPrice,
  onMedianAvailable,
}: {
  itemId: string;
  onSuggestPrice: (price: number) => void;
  onMedianAvailable?: (median: number) => void;
}) {
  const [result, setResult] = useState<PriceResearchResult | null>(null);
  const [salesGoal, setSalesGoal] = useState<SalesGoal>('BALANCED');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    itemsApi
      .priceResearch(itemId, false, salesGoal)
      .then((r) => {
        if (!cancelled) {
          setResult(r);
          const med = r.recommendation?.listPrice ?? r.sources.find((s) => s.median !== null)?.median;
          if (med != null) onMedianAvailable?.(med);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // salesGoal-Wechsel ruft absichtlich erneut ab: der Recommendation-Teil
    // hängt vom Verkaufsziel ab, wird aber serverseitig aus dem Cache
    // berechnet (kein erneuter, kostenpflichtiger Provider-Call), siehe
    // PriceTriangulationService.research().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, salesGoal]);

  const refresh = () => {
    setRefreshing(true);
    setFailed(false);
    itemsApi
      .priceResearch(itemId, true, salesGoal)
      .then(setResult)
      .catch(() => setFailed(true))
      .finally(() => setRefreshing(false));
  };

  if (loading) return (
    <div className="space-y-2">
      <SkeletonBlock className="h-3 w-40" />
      <SkeletonBlock className="h-20 rounded-xl" />
      <SkeletonBlock className="h-14 rounded-xl" />
    </div>
  );
  // Rein beratend — ein Fehlschlag blockiert nie die manuelle Preiseingabe.
  if (failed || !result || result.sources.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-ink-muted uppercase tracking-wide">
          Preisvorschläge (unverbindlich)
        </p>
        <div className="flex items-center gap-2">
          <select
            value={salesGoal}
            onChange={(e) => setSalesGoal(e.target.value as SalesGoal)}
            className="text-[11px] border border-line rounded-lg px-1.5 py-1 bg-surface text-ink-muted outline-none focus:border-accent"
          >
            <option value="BALANCED">Ausgewogen</option>
            <option value="FAST_SALE">Schnell verkaufen</option>
            <option value="MAX_PROFIT">Maximaler Erlös</option>
            <option value="MINIMAL_EFFORT">Minimaler Aufwand</option>
          </select>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="text-[11px] font-bold text-ink-faint hover:text-accent disabled:opacity-60 transition-colors shrink-0"
          >
            {refreshing ? 'Aktualisiert…' : '↻ Neu abrufen'}
          </button>
        </div>
      </div>
      <p className="text-[11px] text-ink-faint">
        Stand: {new Date(result.fetchedAt).toLocaleString('de-DE')}
      </p>

      {result.recommendation && (
        <RecommendationCard recommendation={result.recommendation} onSuggestPrice={onSuggestPrice} />
      )}

      {result.sources.map((source) => (
        <SourceCard key={source.source} source={source} onSuggestPrice={onSuggestPrice} />
      ))}
    </div>
  );
}

function RecommendationCard({
  recommendation,
  onSuggestPrice,
}: {
  recommendation: PriceRecommendation;
  onSuggestPrice: (price: number) => void;
}) {
  return (
    <div className="bg-accent-soft border border-accent/20 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-accent">Abgeleiteter Vorschlag</span>
        <span className="text-[10px] font-bold text-accent/70 uppercase tracking-wide">
          {CONFIDENCE_LABELS[recommendation.confidence]}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-ink-faint uppercase font-bold">Startpreis</p>
          <p className="font-bold text-ink text-sm">{recommendation.listPrice.toFixed(2)} €</p>
        </div>
        <div>
          <p className="text-[10px] text-ink-faint uppercase font-bold">Zielpreis</p>
          <p className="font-bold text-ink text-sm">{recommendation.targetPrice.toFixed(2)} €</p>
        </div>
        <div>
          <p className="text-[10px] text-ink-faint uppercase font-bold">Schmerzgrenze</p>
          <p className="font-bold text-ink text-sm">{recommendation.minPrice.toFixed(2)} €</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onSuggestPrice(recommendation.listPrice)}
        className="w-full text-[11px] font-bold px-2 py-1.5 rounded-lg bg-accent text-accent-ink hover:bg-accent-hover transition-colors"
      >
        Startpreis übernehmen
      </button>

      {recommendation.buybackRecommended && (
        <p className="text-[11px] text-ink-muted">
          💡 Der Ankaufpreis liegt nah am Zielpreis — ein Sofortverkauf ans Ankaufportal könnte einfacher sein.
        </p>
      )}

      <details className="text-[11px] text-ink-faint">
        <summary className="cursor-pointer">Begründung</summary>
        <ul className="mt-1 space-y-0.5 list-disc list-inside">
          {recommendation.reasoning.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function SourceCard({
  source,
  onSuggestPrice,
}: {
  source: PriceResearchSourceResult;
  onSuggestPrice: (price: number) => void;
}) {
  const listings = source.detail?.comparableListings ?? [];

  return (
    <div className="bg-surface-hover border border-line rounded-xl p-3 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-ink-muted">
          {SOURCE_LABELS[source.source] ?? source.source}
        </span>
        {source.median !== null && (
          <button
            type="button"
            onClick={() => onSuggestPrice(source.median as number)}
            className="text-[11px] font-bold px-2 py-1 rounded-lg bg-accent text-accent-ink hover:bg-accent-hover transition-colors shrink-0"
          >
            {source.median.toFixed(2)} € übernehmen
          </button>
        )}
      </div>

      <p className="text-[11px] text-ink-faint">
        {source.source === 'ANKAUF_PORTAL'
          ? `${source.providerLabel}: Ankaufspreis ${Number(source.detail?.buybackPrice ?? 0).toFixed(2)} € → Richtwert (×${source.detail?.multiplier ?? '?'})`
          : source.p25 !== null && source.p75 !== null
            ? `${source.sampleSize} Angebote (${source.providerLabel}), Spanne ${source.p25.toFixed(2)}–${source.p75.toFixed(2)} € (Angebotspreise, keine Verkaufsgarantie)`
            : source.providerLabel}
      </p>

      {listings.length > 0 && (
        <details className="text-[11px] text-ink-faint">
          <summary className="cursor-pointer">Vergleichstitel ({listings.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {listings.map((listing, i) => (
              <li key={i}>
                {listing.url ? (
                  <a
                    href={listing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-accent transition-colors underline underline-offset-2"
                  >
                    {listing.title}
                  </a>
                ) : (
                  listing.title
                )}{' '}
                — {listing.price.toFixed(2)} €
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
