import { useEffect, useState } from 'react';
import { itemsApi } from '../api/items';
import type { PriceResearchResult, PriceResearchSourceResult } from '../api/types';

/**
 * §9d/§9e: Preisvorschläge sind rein beratend, nie automatisch übernommen —
 * "Median übernehmen" befüllt das Preisfeld erst nach explizitem Klick.
 * Jede Quelle bleibt einzeln sichtbar und gelabelt, nie zu einer Zahl
 * vermischt.
 */
const SOURCE_LABELS: Record<string, string> = {
  EBAY_ACTIVE_LISTINGS: 'eBay – aktive Angebote',
  ANKAUF_PORTAL: 'Ankaufportal-Richtwert',
  GEMINI_GROUNDING: 'Gemini – Websuche',
};

export function PriceResearchPanel({
  itemId,
  onSuggestPrice,
}: {
  itemId: string;
  onSuggestPrice: (price: number) => void;
}) {
  const [result, setResult] = useState<PriceResearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    itemsApi
      .priceResearch(itemId)
      .then((r) => {
        if (!cancelled) setResult(r);
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
  }, [itemId]);

  if (loading) return <p className="text-xs text-ink-faint">Preisrecherche lädt…</p>;
  // Rein beratend — ein Fehlschlag blockiert nie die manuelle Preiseingabe.
  if (failed || !result || result.sources.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-ink-muted uppercase tracking-wide">
        Preisvorschläge (unverbindlich)
      </p>
      {result.sources.map((source) => (
        <SourceCard key={source.source} source={source} onSuggestPrice={onSuggestPrice} />
      ))}
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
                {listing.title} — {listing.price.toFixed(2)} €
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
