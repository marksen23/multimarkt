import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ankaufApi } from '../api/ankauf';
import type { AnkaufListing, AnkaufResearchResult, DealScore } from '../api/types';
import { Button, Card, EmptyState, Icon, Notice, PageHeader, inputClass } from '../ui';

type ConditionKey = 'alle' | 'wie_neu' | 'gut' | 'gebraucht' | 'defekt';
type PageTab = 'suche' | 'merkliste';

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
  GUT: { label: 'Gutes Angebot', color: 'text-phase-capture bg-phase-capture-soft border-phase-capture/30' },
  FAIR: { label: 'Fairer Preis', color: 'text-ink-muted bg-surface border-line' },
  TEUER: { label: 'Überteuert', color: 'text-danger bg-danger-soft border-danger/30' },
};

// ---------- Merkliste ----------

interface BookmarkedListing {
  id: string;
  query: string;
  listing: AnkaufListing;
  savedAt: string;
}

function bookmarkId(listing: AnkaufListing): string {
  return listing.url ?? `${listing.title}|${listing.price}|${listing.platform}`;
}

function useAnkaufMerkliste() {
  const [bookmarks, setBookmarks] = useState<BookmarkedListing[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('ankauf-merkliste') ?? '[]') as BookmarkedListing[];
    } catch {
      return [];
    }
  });

  const persist = (next: BookmarkedListing[]) => {
    setBookmarks(next);
    try { localStorage.setItem('ankauf-merkliste', JSON.stringify(next)); } catch {}
  };

  const isBookmarked = (listing: AnkaufListing) => {
    const id = bookmarkId(listing);
    return bookmarks.some((b) => b.id === id);
  };

  const toggle = (listing: AnkaufListing, query: string) => {
    const id = bookmarkId(listing);
    if (bookmarks.some((b) => b.id === id)) {
      persist(bookmarks.filter((b) => b.id !== id));
    } else {
      persist([{ id, query, listing, savedAt: new Date().toISOString() }, ...bookmarks].slice(0, 50));
    }
  };

  const remove = (id: string) => persist(bookmarks.filter((b) => b.id !== id));

  return { bookmarks, isBookmarked, toggle, remove };
}

// ---------- Helpers ----------

function matchesCondition(listing: AnkaufListing, condition: ConditionKey): boolean {
  if (condition === 'alle') return true;
  const keywords = CONDITION_KEYWORDS[condition];
  const text = ((listing.condition ?? '') + ' ' + listing.title).toLowerCase();
  return keywords.some((kw) => text.includes(kw));
}

// ---------- Suchverlauf ----------

function useRecentSearches(max = 5) {
  const KEY = 'ankauf-recent-searches';
  const [recent, setRecent] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]; } catch { return []; }
  });

  const add = (q: string) => {
    const next = [q, ...recent.filter((r) => r !== q)].slice(0, max);
    setRecent(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  };

  return { recent, add };
}

// ---------- Page ----------

export function AnkaufPage() {
  const [pageTab, setPageTab] = useState<PageTab>('suche');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnkaufResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCondition, setActiveCondition] = useState<ConditionKey>('alle');
  const [showMargen, setShowMargen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { bookmarks, isBookmarked, toggle, remove } = useAnkaufMerkliste();

  useEffect(() => {
    if (pageTab === 'suche') {
      inputRef.current?.focus();
    }
  }, [pageTab]);
  const { recent, add: addRecent } = useRecentSearches();

  const search = async (kw: string) => {
    if (!kw.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveCondition('alle');
    setShowMargen(false);
    addRecent(kw.trim());
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
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-4">
      <PageHeader
        title="Ankauf-Recherche"
        subtitle="Gebrauchtangebote in Berlin — Kleinanzeigen, eBay, Vinted & mehr"
      />

      <div className="space-y-3">
        {/* Page tabs */}
        <div className="flex gap-2">
          {(['suche', 'merkliste'] as PageTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setPageTab(tab)}
              className={`h-8 px-4 rounded-full text-label border transition-colors ${
                pageTab === tab
                  ? 'bg-accent text-accent-ink border-accent'
                  : 'bg-surface text-ink-muted border-line hover:border-accent hover:text-accent'
              }`}
            >
              {tab === 'suche' ? 'Suche' : `Merkliste${bookmarks.length > 0 ? ` (${bookmarks.length})` : ''}`}
            </button>
          ))}
        </div>

        {/* Search bar — only in suche tab */}
        {pageTab === 'suche' && (
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
              className={`${inputClass} flex-1 min-w-0`}
            />
            <Button
              type="submit"
              disabled={loading || !query.trim()}
              loading={loading}
              className="whitespace-nowrap"
            >
              Suchen
            </Button>
          </form>
        )}

        {/* Recent searches */}
        {pageTab === 'suche' && recent.length > 0 && !loading && (
          <div className="flex flex-wrap gap-1.5">
            {recent.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => { setQuery(r); void search(r); }}
                className="h-7 px-3 rounded-full text-label font-normal bg-surface border border-line text-ink-muted hover:border-accent hover:text-accent transition-colors"
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {error && pageTab === 'suche' && <Notice tone="danger">{error}</Notice>}
      </div>

      {/* Merkliste tab */}
      {pageTab === 'merkliste' && (
        <div className="space-y-3">
          {bookmarks.length === 0 ? (
            <EmptyState
              icon="inbox"
              title="Noch nichts gemerkt"
              text={'Tippe bei einem Angebot auf „Merken" um es hier zu speichern.'}
            />
          ) : (
            bookmarks.map((b) => (
              <div key={b.id} className="space-y-1">
                <div className="flex items-center justify-between px-1">
                  <p className="text-label font-normal text-ink-faint truncate max-w-[220px]">
                    Suche: <span className="font-semibold text-ink-muted">{b.query}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => remove(b.id)}
                    className="w-7 h-7 -mr-1 rounded-full flex items-center justify-center text-ink-faint hover:text-danger transition-colors"
                    aria-label="Aus Merkliste entfernen"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
                <ListingCard
                  listing={b.listing}
                  bookmarked
                  onToggleBookmark={() => remove(b.id)}
                />
                <Button
                  block
                  size="md"
                  onClick={() => navigate('/new', { state: { title: b.listing.title } })}
                >
                  Aufnehmen →
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Suche tab results */}
      {pageTab === 'suche' && (
        <>
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-4 space-y-2 animate-pulse">
                  <div className="h-4 bg-line rounded w-3/4" />
                  <div className="h-3 bg-line rounded w-1/2" />
                  <div className="h-3 bg-line rounded w-1/3" />
                </Card>
              ))}
            </div>
          )}

          {result && !loading && (
            <div className="space-y-4">
              {/* Market median banner */}
              {result.marketMedianEur !== null && (
                <div className="bg-accent-soft border border-accent/20 rounded-control px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-micro uppercase text-ink-muted">
                        Fairer Marktpreis (Berlin)
                      </p>
                      <p className="text-display text-accent tabular-nums mt-0.5">
                        {result.marketMedianEur.toFixed(2)} €
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-label font-normal text-ink-faint">{result.listings.length} Angebote</p>
                        <p className="text-label font-normal text-ink-faint">{result.location}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowMargen((v) => !v)}
                        className="shrink-0 inline-flex items-center gap-1 text-label px-2.5 py-1.5 rounded-control bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                      >
                        {showMargen ? (
                          <>
                            Rechner <Icon name="x" size={13} strokeWidth={2.4} />
                          </>
                        ) : (
                          '% Marge'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Margen-Rechner */}
              {showMargen && result.marketMedianEur !== null && (
                <MargenRechner marketMedian={result.marketMedianEur} />
              )}

              {/* Search context label + condition filter tabs */}
              <div className="space-y-2">
                <p className="text-label font-normal text-ink-faint">
                  Ergebnisse für{' '}
                  <span className="font-semibold text-ink-muted">„{query.trim()}"</span>
                </p>

                <div className="-mx-4 px-4 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
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
                        className={`shrink-0 h-8 px-3 rounded-full text-label border transition-colors ${
                          activeCondition === key
                            ? 'bg-accent text-accent-ink border-accent'
                            : 'bg-surface text-ink-muted border-line hover:border-accent hover:text-accent'
                        }`}
                      >
                        {CONDITION_LABELS[key]}
                        {count > 0 && <span className="ml-1 tabular-nums opacity-70">({count})</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Condition price impact info */}
              {activeCondition !== 'alle' && conditionImpact[activeCondition] && (
                <div className="px-3 py-2 bg-surface border border-line rounded-control">
                  <p className="text-label font-normal text-ink-muted">
                    <span className="font-semibold text-ink">{CONDITION_LABELS[activeCondition]}:</span>{' '}
                    {conditionImpact[activeCondition].label}
                    {result.marketMedianEur !== null && (
                      <span className="ml-1 text-ink-faint tabular-nums">
                        (≈{' '}
                        {(result.marketMedianEur * conditionImpact[activeCondition].factor).toFixed(0)}{' '}
                        €)
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* Listings */}
              <div className="space-y-3">
                {visibleListings.length === 0 && (
                  <EmptyState
                    icon="search"
                    title="Keine Angebote für diesen Filter."
                    action={
                      activeCondition !== 'alle' ? (
                        <Button variant="secondary" size="sm" onClick={() => setActiveCondition('alle')}>
                          Filter zurücksetzen
                        </Button>
                      ) : undefined
                    }
                  />
                )}
                {visibleListings.map((listing, i) => (
                  <ListingCard
                    key={i}
                    listing={listing}
                    bookmarked={isBookmarked(listing)}
                    onToggleBookmark={() => toggle(listing, query)}
                  />
                ))}
              </div>
            </div>
          )}

          {!result && !loading && !error && (
            <div className="pt-2 text-center">
              <p className="text-body text-ink-faint">
                Gib einen Suchbegriff ein — z. B. „iPhone 14 128GB" oder „Lederjacke Gr. M".
              </p>
              <p className="text-label font-normal text-ink-faint mt-2">Standort: Berlin</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Sub-components ----------

const PLATFORM_FEES: { id: string; label: string; color: string; fee: (price: number) => number }[] = [
  { id: 'KLEINANZEIGEN', label: 'Kleinanzeigen', color: '#0ca35a', fee: () => 0 },
  { id: 'EBAY', label: 'eBay', color: '#e53238', fee: (p) => p * 0.129 + 0.35 },
  { id: 'VINTED', label: 'Vinted', color: '#09b1ba', fee: () => 0 },
];

function MargenRechner({ marketMedian }: { marketMedian: number }) {
  const [buyPrice, setBuyPrice] = useState('');
  const buy = parseFloat(buyPrice.replace(',', '.'));
  const validBuy = !isNaN(buy) && buy > 0;

  return (
    <Card className="p-4 space-y-3">
      <p className="text-micro uppercase text-ink-muted">Margen-Rechner</p>
      <div className="flex gap-2 items-center">
        <input
          type="number"
          inputMode="decimal"
          placeholder="Einkaufspreis in €"
          value={buyPrice}
          onChange={(e) => setBuyPrice(e.target.value)}
          className={`${inputClass} flex-1 min-w-0`}
        />
        <span className="text-label font-normal text-ink-faint tabular-nums">Verkaufspreis: {marketMedian.toFixed(2)} €</span>
      </div>

      {validBuy && (
        <div className="space-y-2">
          {PLATFORM_FEES.map((p) => {
            const fee = p.fee(marketMedian);
            const net = marketMedian - fee;
            const margin = net - buy;
            const marginPct = (margin / buy) * 100;
            const isPositive = margin >= 0;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between bg-surface-hover rounded-control px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-label text-ink">{p.label}</span>
                  {fee > 0 && <span className="text-label font-normal text-ink-faint tabular-nums">−{fee.toFixed(2)} € Gebühr</span>}
                </div>
                <div className="text-right">
                  <p className="text-body font-bold text-ink tabular-nums">{net.toFixed(2)} € netto</p>
                  <p className={`text-label tabular-nums ${isPositive ? 'text-accent' : 'text-danger'}`}>
                    {isPositive ? '+' : ''}{margin.toFixed(2)} € ({marginPct.toFixed(0)} %)
                  </p>
                </div>
              </div>
            );
          })}
          <p className="text-label font-normal text-ink-faint px-1">
            * Kleinanzeigen &amp; Vinted: 0 % Verkäufergebühr (Privatanzeige). eBay: 12,9 % + 0,35 €.
          </p>
        </div>
      )}

      {!validBuy && buyPrice.length > 0 && (
        <p className="text-label text-danger">Bitte einen gültigen Preis eingeben.</p>
      )}
    </Card>
  );
}

function ListingCard({
  listing,
  bookmarked,
  onToggleBookmark,
}: {
  listing: AnkaufListing;
  bookmarked: boolean;
  onToggleBookmark: () => void;
}) {
  const score = listing.dealScore;
  const scoreConfig = score ? SCORE_CONFIG[score] : null;
  const platformColor = PLATFORM_COLORS[listing.platform] ?? '#6b7280';
  const platformLabel = PLATFORM_LABELS[listing.platform] ?? listing.platform;

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-body font-semibold text-ink leading-snug flex-1">{listing.title}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          {scoreConfig && (
            <span className={`text-label px-2 py-0.5 rounded-full border ${scoreConfig.color}`}>
              {scoreConfig.label}
            </span>
          )}
          <button
            type="button"
            onClick={onToggleBookmark}
            title={bookmarked ? 'Aus Merkliste entfernen' : 'Merken'}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              bookmarked
                ? 'bg-accent text-accent-ink hover:bg-accent-hover'
                : 'bg-surface-hover text-ink-faint hover:text-accent hover:bg-accent-soft border border-line'
            }`}
            aria-label={bookmarked ? 'Aus Merkliste entfernen' : 'Merken'}
          >
            <Icon name={bookmarked ? 'check' : 'plus'} size={15} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-title text-ink tabular-nums">{listing.price.toFixed(2)} €</span>
        {listing.priceVsMarketPct !== null && (
          <span
            className={`text-label tabular-nums ${listing.priceVsMarketPct < 0 ? 'text-accent' : 'text-danger'}`}
          >
            {listing.priceVsMarketPct > 0 ? '+' : ''}
            {listing.priceVsMarketPct} % zum Marktpreis
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: platformColor }} />
          <span className="text-label font-normal text-ink-muted">{platformLabel}</span>
          {listing.condition && (
            <>
              <span className="text-ink-faint">·</span>
              <span className="text-label font-normal text-ink-faint truncate max-w-[140px]">{listing.condition}</span>
            </>
          )}
        </div>
        {listing.url ? (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-label text-accent hover:text-accent-hover transition-colors shrink-0"
          >
            Anzeige öffnen
            <Icon name="external" size={13} />
          </a>
        ) : (
          <span className="text-label font-normal text-ink-faint shrink-0">Kein Link</span>
        )}
      </div>
    </Card>
  );
}
