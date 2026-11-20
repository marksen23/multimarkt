import { useEffect, useState } from 'react';
import { itemsApi } from '../api/items';
import type { PriceRecommendation, PriceResearchResult, PriceResearchSourceResult, SalesGoal } from '../api/types';
import { MarketplaceSearchLinks } from './MarketplaceSearchLinks';
import { SkeletonBlock } from './Skeleton';
import { formatEuro } from '../lib/format';
import { Button, Icon, Notice, Spinner } from '../ui';
import type { LogisticsProfile } from '../logistics/profile';
import { ChannelNetComparison } from './ChannelNetComparison';
import { ExpectedMarginFields } from './ExpectedMarginFields';

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

const QUERY_LEVEL_NOTE: Record<string, string> = {
  specific: 'enge Suche',
  broader: 'breitere Suche, die enge hatte zu wenig Treffer',
  broad: 'weite Suche, nur die Artikelart',
};

export function PriceResearchPanel({
  itemId,
  purchasePriceEur,
  logistics,
  onSuggestPrice,
  onMedianAvailable,
}: {
  itemId: string;
  purchasePriceEur: number | null;
  logistics?: LogisticsProfile | null;
  onSuggestPrice: (price: number) => void;
  onMedianAvailable?: (median: number) => void;
}) {
  const [result, setResult] = useState<PriceResearchResult | null>(null);
  const [salesGoal, setSalesGoal] = useState<SalesGoal>('FAST_SALE');
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
          const med = marketAnchor(r);
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
      <SkeletonBlock className="h-20" />
      <SkeletonBlock className="h-14" />
    </div>
  );
  if (failed) {
    return (
      <Notice tone="warning">
        Preisvergleich gerade nicht erreichbar. Den Preis kannst du trotzdem von Hand eintragen.
      </Notice>
    );
  }
  if (!result) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-micro uppercase text-ink-muted">
          Preisvorschläge (unverbindlich)
        </p>
        <div className="flex items-center gap-2">
          <select
            value={salesGoal}
            aria-label="Verkaufsziel"
            onChange={(e) => setSalesGoal(e.target.value as SalesGoal)}
            className="text-label font-normal border border-line rounded-control px-1.5 py-1 bg-surface text-ink-muted outline-none focus:border-accent"
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
            className="inline-flex items-center gap-1 text-label text-ink-faint hover:text-accent disabled:opacity-60 transition-colors shrink-0"
          >
            {refreshing ? <Spinner /> : <Icon name="refresh" size={13} />}
            Neu abrufen
          </button>
        </div>
      </div>
      <p className="text-label font-normal text-ink-faint">
        Stand: {new Date(result.fetchedAt).toLocaleString('de-DE')}
        {result.query ? ` · eBay.de: „${result.query}“` : ''}
        {result.queryLevel && QUERY_LEVEL_NOTE[result.queryLevel]
          ? ` · ${QUERY_LEVEL_NOTE[result.queryLevel]}`
          : ''}
      </p>
      {result.notice && <Notice tone={noticeTone(result.notice)}>{result.notice}</Notice>}
      <MarketplaceSearchLinks links={result.searchLinks} />

      {result.recommendation && (
        <>
          <RecommendationCard recommendation={result.recommendation} onSuggestPrice={onSuggestPrice} />
          {result.recommendation.startPriceRecommended && (
            <>
              <ExpectedMarginFields
                salePriceEur={result.recommendation.quickSalePrice ?? result.recommendation.targetPrice}
                purchasePriceEur={purchasePriceEur}
                salePriceLabel="Schnellverkauf"
              />
              <ChannelNetComparison
                salePriceEur={result.recommendation.quickSalePrice ?? result.recommendation.targetPrice}
                salePriceLabel="Schnellverkauf"
                logistics={logistics}
              />
            </>
          )}
        </>
      )}

      {result.sources.map((source) => (
        <SourceCard key={source.source} source={source} onSuggestPrice={onSuggestPrice} />
      ))}
    </div>
  );
}

function marketAnchor(result: PriceResearchResult): number | null {
  if (result.recommendation?.startPriceRecommended) return result.recommendation.listPrice;
  if (result.recommendation) return null;
  return result.sources.find((s) => s.median !== null)?.median ?? null;
}

function formatSpan(low: number, high: number): string {
  const amount = (value: number) =>
    value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount(low)}–${amount(high)} €`;
}

function noticeTone(notice: string): 'warning' | 'info' {
  return /Schlüssel|abgelehnt|nicht erreichbar|Limit/.test(notice) ? 'warning' : 'info';
}

function RecommendationCard({
  recommendation,
  onSuggestPrice,
}: {
  recommendation: PriceRecommendation;
  onSuggestPrice: (price: number) => void;
}) {
  const showPrices = recommendation.startPriceRecommended;
  const quickSale = recommendation.quickSalePrice ?? recommendation.targetPrice;

  return (
    <div className="bg-accent-soft border border-accent/20 rounded-control p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-accent">
          {showPrices ? 'Schnellverkauf' : 'Preisspanne'}
        </span>
        <span className="text-micro uppercase text-accent/70">
          {CONFIDENCE_LABELS[recommendation.confidence]}
        </span>
      </div>

      {showPrices ? (
        <p className="font-bold text-ink text-title tabular-nums">{formatEuro(quickSale)}</p>
      ) : null}

      <div className="text-center">
        <p className="text-micro uppercase text-ink-faint">Aktive Angebote</p>
        <p className="font-bold text-ink text-body tabular-nums">
          {formatSpan(recommendation.rangeLow, recommendation.rangeHigh)}
        </p>
      </div>

      <div className="text-label font-normal text-ink-muted space-y-0.5">
        <p>{recommendation.sampleSize} passende Angebote</p>
        <p>{recommendation.priceBasisNote}</p>
        {recommendation.conditionNote && <p>{recommendation.conditionNote}</p>}
        {recommendation.confidenceNote && <p>{recommendation.confidenceNote}</p>}
      </div>

      {showPrices ? (
        <>
          <Button size="sm" block onClick={() => onSuggestPrice(quickSale)}>
            Schnellverkaufspreis übernehmen
          </Button>
          {recommendation.listPrice !== quickSale && (
            <button
              type="button"
              onClick={() => onSuggestPrice(recommendation.listPrice)}
              className="block w-full text-label text-ink-muted underline underline-offset-2"
            >
              Stattdessen den Startpreis {formatEuro(recommendation.listPrice)} für das gewählte Verkaufsziel
            </button>
          )}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-micro uppercase text-ink-faint">Startpreis</p>
              <p className="text-label text-ink tabular-nums">{formatEuro(recommendation.listPrice)}</p>
            </div>
            <div>
              <p className="text-micro uppercase text-ink-faint">Zielpreis</p>
              <p className="text-label text-ink tabular-nums">{formatEuro(recommendation.targetPrice)}</p>
            </div>
            <div>
              <p className="text-micro uppercase text-ink-faint">Schmerzgrenze</p>
              <p className="text-label text-ink tabular-nums">{formatEuro(recommendation.minPrice)}</p>
            </div>
          </div>
        </>
      ) : (
        <p className="text-label font-normal text-ink-muted">
          Unter fünf passenden Angeboten kein konkreter Preis, nur die Spanne.
        </p>
      )}

      {showPrices && recommendation.buybackRecommended && (
        <p className="flex items-start gap-1.5 text-label font-normal text-ink-muted">
          <Icon name="sparkle" size={14} className="mt-px text-accent" />
          Der Ankaufpreis liegt nah am Zielpreis — ein Sofortverkauf ans Ankaufportal könnte einfacher sein.
        </p>
      )}

      <details className="text-label font-normal text-ink-faint">
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

function isExampleSource(source: PriceResearchSourceResult): boolean {
  if (source.detail?.illustrative === true) return true;
  return /\(Mock\)/i.test(source.providerLabel);
}

function SourceCard({
  source,
  onSuggestPrice,
}: {
  source: PriceResearchSourceResult;
  onSuggestPrice: (price: number) => void;
}) {
  const listings = source.detail?.comparableListings ?? [];
  const example = isExampleSource(source);

  return (
    <div className="bg-surface-hover border border-line rounded-control p-3 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-ink-muted">
          {example
            ? source.source === 'ANKAUF_PORTAL'
              ? 'Ankaufportal (Beispiel)'
              : `${SOURCE_LABELS[source.source] ?? source.source} (Beispiel)`
            : (SOURCE_LABELS[source.source] ?? source.source)}
        </span>
        {source.median !== null && !example && (
          <Button size="sm" className="shrink-0 tabular-nums" onClick={() => onSuggestPrice(source.median as number)}
          >
            {formatEuro(source.median)} übernehmen
          </Button>
        )}
      </div>

      <p className="text-label font-normal text-ink-faint">
        {example && source.source === 'ANKAUF_PORTAL'
          ? `${source.providerLabel}: Beispiel, kein echtes Angebot (${Number(source.detail?.buybackPrice ?? 0).toFixed(2)} €). Hebt die Schmerzgrenze nicht an und lenkt nicht zum Ankauf.`
          : example
            ? `${source.providerLabel}: Beispielwerte, kein Marktpreis. Sie fließen nicht in Startpreis, Zielpreis oder Schmerzgrenze.`
            : source.source === 'ANKAUF_PORTAL'
            ? `${source.providerLabel}: Ankaufspreis ${formatEuro(Number(source.detail?.buybackPrice ?? 0))} → Richtwert (×${source.detail?.multiplier ?? '?'})`
            : source.p25 !== null && source.p75 !== null
              ? `${source.sampleSize} Angebote (${source.providerLabel}), Spanne ${formatSpan(source.p25, source.p75)}. Aktive Angebotspreise, keine abgeschlossenen Verkäufe.`
              : source.providerLabel}
      </p>
      {source.detail?.filterNote && (
        <p className="text-label font-normal text-ink-faint">{source.detail.filterNote}</p>
      )}

      {listings.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-label font-normal text-ink-faint">
          {listings.slice(0, 6).map((listing, i) => (
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
              — {formatEuro(listing.price)}
              {listing.shippingEur != null && listing.shippingEur > 0 ? ' inkl. Versand' : ''}
              {listing.condition ? ` · ${listing.condition}` : ''}
            </li>
          ))}
          {listings.length > 6 && (
            <li>
              <details>
                <summary className="cursor-pointer">Weitere {listings.length - 6}</summary>
                <ul className="mt-1 space-y-0.5">
                  {listings.slice(6).map((listing, i) => (
                    <li key={i}>
                      {listing.url ? (
                        <a href={listing.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                          {listing.title}
                        </a>
                      ) : (
                        listing.title
                      )}{' '}
                      — {formatEuro(listing.price)}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
