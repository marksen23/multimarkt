import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ankaufApi } from '../api/ankauf';
import { ApiRequestError } from '../api/client';
import { itemsApi } from '../api/items';
import type {
  AnkaufListing,
  AnkaufResearchResult,
  AnkaufSearchProfile,
  AnkaufSearchSummary,
  DealScore,
} from '../api/types';
import { Button, Card, EmptyState, Field, Icon, Notice, PageHeader, SectionLabel, Spinner, inputClass } from '../ui';
import { formatEuro } from '../lib/format';

type ConditionKey = 'alle' | 'wie_neu' | 'gut' | 'gebraucht' | 'defekt' | 'unsicher';

const RADIUS_OPTIONS_KM = [5, 10, 20, 30, 50, 100, 150, 200];

const CONDITION_LABELS: Record<ConditionKey, string> = {
  alle: 'Alle',
  wie_neu: 'Wie neu',
  gut: 'Gut erhalten',
  gebraucht: 'Gebraucht',
  defekt: 'Defekt',
  unsicher: 'Unsicher',
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

function matchesCondition(listing: AnkaufListing, condition: ConditionKey): boolean {
  if (condition === 'alle') return true;
  if (condition === 'unsicher') return listing.conditionUncertain;
  return listing.conditionKey === condition;
}

function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.body.message : fallback;
}

function formatSearchedAt(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AnkaufPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [radiusKm, setRadiusKm] = useState(20);
  const [savedProfile, setSavedProfile] = useState<AnkaufSearchProfile | null>(null);
  const [searches, setSearches] = useState<AnkaufSearchSummary[]>([]);
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [result, setResult] = useState<AnkaufResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCondition, setActiveCondition] = useState<ConditionKey>('alle');
  const [adoptingKey, setAdoptingKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    Promise.all([ankaufApi.profile(), ankaufApi.searches()])
      .then(([profile, history]) => {
        if (!active) return;
        setSavedProfile(profile);
        setPostalCode(profile.postalCode ?? '');
        setRadiusKm(profile.radiusKm);
        setSearches(history);
      })
      .catch((e) => {
        if (!active) return;
        setError(errorMessage(e, 'Suchprofil konnte nicht geladen werden.'));
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const postalOk = /^\d{5}$/.test(postalCode.trim());

  const adopt = async (listing: AnkaufListing, key: string) => {
    setAdoptingKey(key);
    setError(null);
    try {
      const item = await itemsApi.createFromPurchase({
        title: listing.title,
        price: listing.price,
        portal: PLATFORM_LABELS[listing.platform] ?? listing.platform,
        date: todayLocal(),
        condition: listing.condition,
        url: listing.url,
      });
      navigate(`/items/${item.id}`);
    } catch {
      setError('Einkauf konnte nicht übernommen werden.');
      setAdoptingKey(null);
    }
  };

  const ensureProfile = async (): Promise<boolean> => {
    const plz = postalCode.trim();
    if (!/^\d{5}$/.test(plz)) {
      setError('Die PLZ braucht fünf Ziffern.');
      return false;
    }
    if (savedProfile?.postalCode === plz && savedProfile.radiusKm === radiusKm) return true;
    const profile = await ankaufApi.updateProfile({ postalCode: plz, radiusKm });
    setSavedProfile(profile);
    setPostalCode(profile.postalCode ?? plz);
    setRadiusKm(profile.radiusKm);
    return true;
  };

  const search = async (kw: string) => {
    if (!kw.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveCondition('alle');
    setActiveSearchId(null);
    try {
      const ready = await ensureProfile();
      if (!ready) return;
      const next = await ankaufApi.search(kw.trim());
      setResult(next);
      setQuery(kw.trim());
      try {
        const history = await ankaufApi.searches();
        setSearches(history);
        setActiveSearchId(history[0]?.id ?? null);
      } catch {
        // Die Treffer bleiben sichtbar, auch wenn die Liste gerade nicht lädt.
      }
    } catch (e) {
      setError(errorMessage(e, 'Suche fehlgeschlagen. Bitte erneut versuchen.'));
    } finally {
      setLoading(false);
    }
  };

  const openSaved = async (item: AnkaufSearchSummary) => {
    setLoading(true);
    setError(null);
    setActiveCondition('alle');
    setQuery(item.keywords);
    try {
      setResult(await ankaufApi.openSearch(item.id));
      setActiveSearchId(item.id);
    } catch (e) {
      setError(errorMessage(e, 'Diese Suche ließ sich nicht öffnen.'));
    } finally {
      setLoading(false);
    }
  };

  const visibleListings =
    result?.listings.filter((l) => matchesCondition(l, activeCondition)) ?? [];

  const conditionImpact = result?.conditionPriceImpact ?? {};
  const placeLabel = savedProfile?.postalCode
    ? `PLZ ${savedProfile.postalCode} · ${savedProfile.radiusKm} km`
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-4">
      <PageHeader
        title="Ankauf-Recherche"
        subtitle="Gebrauchtangebote rund um deine PLZ — Kleinanzeigen, eBay, Vinted und mehr"
      />

      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-2">
            <Field label="PLZ">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={5}
                placeholder="z. B. 50667"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                className={inputClass}
              />
            </Field>
            <Field label="Umkreis">
              <select
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className={inputClass}
              >
                {RADIUS_OPTIONS_KM.map((km) => (
                  <option key={km} value={km}>
                    {km} km
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="text-label font-normal text-ink-faint flex items-center gap-1.5">
            {profileLoading && <Spinner />}
            <span>
              {profileLoading
                ? 'Suchprofil wird geladen…'
                : placeLabel
                  ? `Suchprofil: ${placeLabel}`
                  : 'Die Suche startet, sobald die PLZ steht.'}
              {postalCode.length > 0 && !postalOk ? ' · PLZ mit fünf Ziffern.' : ''}
            </span>
          </div>
        </div>

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
            disabled={loading || profileLoading || !query.trim() || !postalOk}
            loading={loading}
            className="whitespace-nowrap"
          >
            Suchen
          </Button>
        </form>

        {searches.length > 0 && (
          <div>
            <SectionLabel>Letzte Suchen</SectionLabel>
            <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {searches.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void openSaved(item)}
                  className={`shrink-0 text-left px-3 py-2 rounded-control border text-label font-normal transition-colors ${
                    activeSearchId === item.id
                      ? 'bg-accent text-accent-ink border-accent'
                      : 'bg-surface text-ink-muted border-line hover:border-accent hover:text-accent'
                  }`}
                >
                  <span className="block font-semibold">{item.keywords}</span>
                  <span
                    className={`block mt-0.5 tabular-nums ${activeSearchId === item.id ? 'opacity-80' : 'text-ink-faint'}`}
                  >
                    {item.postalCode} · {item.radiusKm} km · {item.listingCount} Angebote ·{' '}
                    {formatSearchedAt(item.searchedAt)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <Notice tone="danger">{error}</Notice>}
      </div>

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
          {result.marketMedianEur !== null && (
            <div className="bg-accent-soft border border-accent/20 rounded-control px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-micro uppercase text-ink-muted">Fairer Marktpreis</p>
                  <p className="text-display text-accent tabular-nums mt-0.5">
                    {formatEuro(result.marketMedianEur)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-label font-normal text-ink-faint">{result.listings.length} Angebote</p>
                  <p className="text-label font-normal text-ink-faint">{result.location}</p>
                </div>
              </div>
            </div>
          )}

          <div className="-mx-4 px-4 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {(Object.keys(CONDITION_LABELS) as ConditionKey[]).map((key) => {
              const count = result.listings.filter((l) => matchesCondition(l, key)).length;
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
                  {count > 0 && <span className="ml-1 tabular-nums opacity-70">{count}</span>}
                </button>
              );
            })}
          </div>

          {activeCondition !== 'alle' &&
            activeCondition !== 'unsicher' &&
            conditionImpact[activeCondition] && (
              <div className="px-3 py-2 bg-surface border border-line rounded-control">
                <p className="text-label font-normal text-ink-muted">
                  <span className="font-semibold text-ink">{CONDITION_LABELS[activeCondition]}:</span>{' '}
                  {conditionImpact[activeCondition].label}
                  {result.marketMedianEur !== null && (
                    <span className="ml-1 text-ink-faint tabular-nums">
                      (≈ {formatEuro(result.marketMedianEur * conditionImpact[activeCondition].factor, 0)})
                    </span>
                  )}
                </p>
              </div>
            )}

          {activeCondition === 'unsicher' && (
            <div className="px-3 py-2 bg-surface border border-line rounded-control">
              <p className="text-label font-normal text-ink-muted">
                Die Quelle nennt keinen eindeutigen Zustand. Angezeigt wird die Angabe aus der Anzeige.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {visibleListings.length === 0 && (
              <EmptyState icon="search" title="Keine Angebote für diesen Filter" />
            )}
            {visibleListings.map((listing, i) => {
              const key = `${listing.platform}-${listing.title}-${i}`;
              return (
                <ListingCard
                  key={key}
                  listing={listing}
                  adopting={adoptingKey === key}
                  onAdopt={() => void adopt(listing, key)}
                />
              );
            })}
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="pt-2 text-center">
          <p className="text-body text-ink-faint">
            Gib einen Suchbegriff ein — z. B. „iPhone 14 128GB" oder „Lederjacke Gr. M".
          </p>
          <p className="text-label font-normal text-ink-faint mt-2">
            {placeLabel ? `Standort: ${placeLabel}` : 'Standort: deine PLZ'}
          </p>
        </div>
      )}
    </div>
  );
}

function ListingCard({
  listing,
  adopting,
  onAdopt,
}: {
  listing: AnkaufListing;
  adopting: boolean;
  onAdopt: () => void;
}) {
  const score = listing.dealScore;
  const scoreConfig = score ? SCORE_CONFIG[score] : null;
  const platformColor = PLATFORM_COLORS[listing.platform] ?? '#6b7280';
  const platformLabel = PLATFORM_LABELS[listing.platform] ?? listing.platform;

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-body font-semibold text-ink leading-snug flex-1">{listing.title}</p>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {listing.conditionUncertain && (
            <span className="text-label px-2 py-0.5 rounded-full border text-warning bg-warning-soft border-warning/30">
              Zustand unsicher
            </span>
          )}
          {scoreConfig && (
            <span className={`text-label px-2 py-0.5 rounded-full border ${scoreConfig.color}`}>
              {scoreConfig.label}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-title text-ink tabular-nums">{formatEuro(listing.price)}</span>
        {listing.priceVsMarketPct !== null && (
          <span
            className={`text-label tabular-nums ${listing.priceVsMarketPct < 0 ? 'text-accent' : 'text-danger'}`}
          >
            {listing.priceVsMarketPct > 0 ? '+' : ''}
            {listing.priceVsMarketPct} % zum Marktpreis
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: platformColor }} />
          <span className="text-label font-normal text-ink-muted">{platformLabel}</span>
          <span className="text-ink-faint">·</span>
          <span className="text-label font-normal text-ink-faint truncate">
            {listing.condition ?? 'Keine Zustandsangabe'}
          </span>
        </div>
        {listing.url ? (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-label text-accent hover:text-accent-hover transition-colors shrink-0"
          >
            Anzeige
            <Icon name="external" size={13} />
          </a>
        ) : (
          <span className="text-label font-normal text-ink-faint shrink-0">Kein Link</span>
        )}
      </div>
      <button
        type="button"
        disabled={adopting}
        onClick={onAdopt}
        className="w-full text-label px-3 py-2 rounded-control border border-accent text-accent hover:bg-accent-soft disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-1.5"
      >
        {adopting && <Spinner />}
        {adopting ? 'Übernimmt…' : 'Als Einkauf übernehmen'}
      </button>
    </Card>
  );
}
