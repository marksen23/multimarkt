import { useRef, useState } from 'react';
import { ankaufApi } from '../api/ankauf';
import type { AnkaufListing, AnkaufResearchResult, DealScore } from '../api/types';

type ConditionKey = 'alle' | 'wie_neu' | 'gut' | 'gebraucht' | 'defekt';

const CONDITION_LABELS: Record<ConditionKey, string> = {
  alle: 'Alle',
  wie_neu: 'Wie neu',
  gut: 'Gut erhalten',
  gebraucht: 'Gebraucht',
  defekt: 'Defekt',
};

const CONDITION_KEYWORDS: Record<ConditionKey, string[]> = {
  alle: [],
  wie_neu: ['wie neu', 'neuwertig', 'ovp', 'unbenutzt', 'ungetragen', 'kaum getragen', 'originalrechnung'],
  gut: ['sehr guter', 'sehr gut', 'guter zustand', 'gut erhalten', 'gut'],
  gebraucht: ['gebraucht', 'gebrauchsspuren', 'kratzer', 'kleine mängel'],
  defekt: ['defekt', 'bastler', 'kaputt', 'reparatur', 'löst sich'],
};

const PLATFORM_LABELS: Record<string, string> = {
  KLEINANZEIGEN: 'Kleinanzeigen',
  EBAY: 'eBay',
  VINTED: 'Vinted',
  FACEBOOK: 'Facebook',
  SONSTIGE: 'Sonstige',
};

const PLATFORM_COLORS: Record<string, string> = {
  KLEINANZEIGEN: '#0ca35a',
  EBAY: '#e53238',
  VINTED: '#09b1ba',
  FACEBOOK: '#1877f2',
  SONSTIGE: '#6b7280',
};

const SCORE_CONFIG: Record<DealScore, { label: string; color: string }> = {
  SEHR_GUT: { label: 'Sehr gutes Angebot', color: 'text-accent bg-accent-soft border-accent/30' },
  GUT: { label: 'Gutes Angebot', color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800' },
  FAIR: { label: 'Fairer Preis', color: 'text-ink-muted bg-surface border-line' },
  TEUER: { label: 'Überteuert', color: 'text-danger bg-danger-soft border-danger/30' },
};

function matchesCondition(listing: AnkaufListing, condition: ConditionKey): boolean {
  if (condition === 'alle') return true;
  const keywords = CONDITION_KEYWORDS[condition];
  const text = ((listing.condition ?? '') + ' ' + listing.title).toLowerCase();
  return keywords.some((kw) => text.includes(kw));
}

export function AnkaufPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnkaufResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCondition, setActiveCondition] = useState<ConditionKey>('alle');
  const inputRef = useRef<HTMLInputElement>(null);

  const search = async (kw: string) => {
    if (!kw.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveCondition('alle');
    try {
      setResult(await ankaufApi.search(kw.trim()));
    } catch {
      setError('Suche fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setLoading(false);
    }
  };

  const visibleListings =
    result?.listings.filter((l) => matchesCondition(l, activeCondition)) ?? [];

  const conditionImpact = result?.conditionPriceImpact ?? {};

  return (
    <div className="max-w-md mx-auto pb-12">
      <div className="p-4">
        <h1 className="text-lg font-bold text-ink mb-1">Ankauf-Recherche</h1>
        <p className="text-xs text-ink-muted mb-4">Gebrauchtangebote in Berlin — Kleinanzeigen, eBay, Vinted & mehr</p>

        {/* Search bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search(query);
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="search"
            placeholder="z. B. Nike Air Max 90 Gr. 42"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 px-4 py-3 border border-line rounded-xl text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft bg-transparent text-ink"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-5 py-3 rounded-xl font-bold bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors whitespace-nowrap"
          >
            {loading ? '…' : 'Suchen'}
          </button>
        </form>

        {error && (
          <div className="mt-3 bg-danger-soft border border-danger/20 rounded-xl p-3 text-xs text-danger">
            {error}
          </div>
        )}
      </div>

      {loading && (
        <div className="px-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface border border-line rounded-2xl p-4 space-y-2 animate-pulse">
              <div className="h-4 bg-line rounded w-3/4" />
              <div className="h-3 bg-line rounded w-1/2" />
              <div className="h-3 bg-line rounded w-1/3" />
            </div>
          ))}
        </div>
      )}

      {result && !loading && (
        <>
          {/* Market median banner */}
          {result.marketMedianEur !== null && (
            <div className="mx-4 mb-4 bg-accent-soft border border-accent/20 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wide">
                    Fairer Marktpreis (Berlin)
                  </p>
                  <p className="text-xl font-bold text-accent mt-0.5">
                    {result.marketMedianEur.toFixed(2)} €
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-ink-faint">{result.listings.length} Angebote</p>
                  <p className="text-[11px] text-ink-faint">{result.location}</p>
                </div>
              </div>
            </div>
          )}

          {/* Condition filter tabs */}
          <div className="px-4 mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {(Object.keys(CONDITION_LABELS) as ConditionKey[]).map((key) => {
              const count =
                key === 'alle'
                  ? result.listings.length
                  : result.listings.filter((l) => matchesCondition(l, key)).length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveCondition(key)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    activeCondition === key
                      ? 'bg-accent text-accent-ink border-accent'
                      : 'bg-surface text-ink-muted border-line hover:border-accent hover:text-accent'
                  }`}
                >
                  {CONDITION_LABELS[key]}
                  {count > 0 && (
                    <span className="ml-1 opacity-70">({count})</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Condition price impact info */}
          {activeCondition !== 'alle' && conditionImpact[activeCondition] && (
            <div className="mx-4 mb-4 px-3 py-2 bg-surface border border-line rounded-xl">
              <p className="text-xs text-ink-muted">
                <span className="font-bold text-ink">{CONDITION_LABELS[activeCondition]}:</span>{' '}
                {conditionImpact[activeCondition].label}
                {result.marketMedianEur !== null && (
                  <span className="ml-1 text-ink-faint">
                    (≈{' '}
                    {(result.marketMedianEur * conditionImpact[activeCondition].factor).toFixed(0)}{' '}
                    €)
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Listings */}
          <div className="px-4 space-y-3">
            {visibleListings.length === 0 && (
              <p className="text-sm text-ink-muted text-center py-8">
                Keine Angebote für diesen Filter gefunden.
              </p>
            )}
            {visibleListings.map((listing, i) => (
              <ListingCard key={i} listing={listing} />
            ))}
          </div>
        </>
      )}

      {!result && !loading && !error && (
        <div className="px-4 mt-6 text-center">
          <p className="text-sm text-ink-faint">
            Gib einen Suchbegriff ein — z. B. „iPhone 14 128GB" oder „Lederjacke Gr. M".
          </p>
          <p className="text-xs text-ink-faint mt-2">Standort: Berlin</p>
        </div>
      )}
    </div>
  );
}

function ListingCard({ listing }: { listing: AnkaufListing }) {
  const score = listing.dealScore;
  const scoreConfig = score ? SCORE_CONFIG[score] : null;
  const platformColor = PLATFORM_COLORS[listing.platform] ?? '#6b7280';
  const platformLabel = PLATFORM_LABELS[listing.platform] ?? listing.platform;

  return (
    <div className="bg-surface border border-line rounded-2xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-ink leading-snug flex-1">{listing.title}</p>
        {scoreConfig && (
          <span
            className={`flex-shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full border ${scoreConfig.color}`}
          >
            {scoreConfig.label}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-lg font-bold text-ink">{listing.price.toFixed(2)} €</span>
        {listing.priceVsMarketPct !== null && (
          <span
            className={`text-xs font-bold ${listing.priceVsMarketPct < 0 ? 'text-accent' : 'text-danger'}`}
          >
            {listing.priceVsMarketPct > 0 ? '+' : ''}
            {listing.priceVsMarketPct} % zum Marktpreis
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: platformColor }} />
          <span className="text-xs text-ink-muted">{platformLabel}</span>
          {listing.condition && (
            <>
              <span className="text-ink-faint">·</span>
              <span className="text-xs text-ink-faint truncate max-w-[140px]">{listing.condition}</span>
            </>
          )}
        </div>
        {listing.url ? (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-accent hover:text-accent-hover transition-colors flex-shrink-0"
          >
            Anzeige öffnen ↗
          </a>
        ) : (
          <span className="text-xs text-ink-faint flex-shrink-0">Kein Link</span>
        )}
      </div>
    </div>
  );
}
