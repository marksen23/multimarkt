import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bundlesApi } from '../api/bundles';
import { ApiRequestError } from '../api/client';
import type { BundleListEntry, BundleLifecycleState } from '../api/types';
import { BundleSuggestions } from '../components/BundleSuggestions';
import { ListSkeleton } from '../components/Skeleton';
import { ButtonLink, Button, Card, EmptyState, Icon, Notice, PageHeader, PhaseBadge, type IconName } from '../ui';
import { relativeDate } from '../lib/format';

type FilterKey = 'alle' | 'aktiv' | 'abgeschlossen';
type SortKey = 'newest' | 'price-desc';

const FILTER_LABELS: Record<FilterKey, string> = {
  alle: 'Alle',
  aktiv: 'Aktiv',
  abgeschlossen: 'Abgeschlossen',
};

const ACTIVE_STATES: BundleLifecycleState[] = ['NEW', 'READY', 'LISTED'];
const CLOSED_STATES: BundleLifecycleState[] = ['SOLD', 'CANCELLED'];

export function BundlesPage() {
  const [entries, setEntries] = useState<BundleListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>(() => {
    try { return (localStorage.getItem('bundles_filter') as FilterKey) ?? 'alle'; } catch { return 'alle'; }
  });
  const [sort, setSort] = useState<SortKey>(() => {
    try { return (localStorage.getItem('bundles_sort') as SortKey) ?? 'newest'; } catch { return 'newest'; }
  });

  useEffect(() => {
    bundlesApi
      .list()
      .then(setEntries)
      .catch((e) => setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler'));
  }, []);

  const filtered = entries?.filter((e) => {
    if (filter === 'aktiv') return ACTIVE_STATES.includes(e.bundle.status);
    if (filter === 'abgeschlossen') return CLOSED_STATES.includes(e.bundle.status);
    return true;
  }) ?? [];

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'price-desc') {
      return (b.listings[0]?.sellingPrice ?? 0) - (a.listings[0]?.sellingPrice ?? 0);
    }
    return new Date(b.bundle.createdAt).getTime() - new Date(a.bundle.createdAt).getTime();
  });

  const setFilterPersist = (f: FilterKey) => {
    setFilter(f);
    try { localStorage.setItem('bundles_filter', f); } catch {}
  };
  const setSortPersist = (s: SortKey) => {
    setSort(s);
    try { localStorage.setItem('bundles_sort', s); } catch {}
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-4">
      <PageHeader
        title="Bundles"
        action={
          <ButtonLink to="/bundles/new" size="sm" icon="plus">
            Neues Bundle
          </ButtonLink>
        }
      />

      <BundleSuggestions />

      {error && <Notice tone="danger">{error}</Notice>}

      {/* Filter + Sort */}
      {entries && entries.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5 overflow-x-auto">
            {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => {
              const count =
                key === 'alle'
                  ? entries.length
                  : key === 'aktiv'
                  ? entries.filter((e) => ACTIVE_STATES.includes(e.bundle.status)).length
                  : entries.filter((e) => CLOSED_STATES.includes(e.bundle.status)).length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterPersist(key)}
                  className={`shrink-0 h-8 px-3 rounded-full text-label border transition-colors ${
                    filter === key
                      ? 'bg-ink text-bg border-ink'
                      : 'bg-surface text-ink-muted border-line hover:text-ink hover:border-ink-faint'
                  }`}
                >
                  {FILTER_LABELS[key]}
                  {count > 0 && <span className="ml-1 tabular-nums opacity-70">({count})</span>}
                </button>
              );
            })}
          </div>
          <select
            value={sort}
            onChange={(e) => setSortPersist(e.target.value as SortKey)}
            className="shrink-0 h-8 text-label text-ink-muted bg-surface border border-line rounded-control px-2.5 outline-none focus:border-accent"
          >
            <option value="newest">Neueste</option>
            <option value="price-desc">Preis ↓</option>
          </select>
        </div>
      )}

      {!entries && !error && <ListSkeleton />}

      {entries && entries.length === 0 && (
        <Card className="p-8 space-y-5">
          <div className="text-center space-y-1">
            <p className="text-title text-ink">Mehrere Artikel, ein Angebot</p>
            <p className="text-body text-ink-muted">
              Sinnvoll für Artikel, die einzeln kaum Erlös bringen.
            </p>
          </div>
          <div className="space-y-3">
            {(
              [
                { icon: 'package', label: 'Bundle anlegen', sub: 'Titel vergeben, bereite Artikel hinzufügen.' },
                { icon: 'euro', label: 'Preis festlegen', sub: 'Gemeinsamer Preis für alle Artikel.' },
                { icon: 'check', label: 'Einmal verkaufen', sub: 'Alle Artikel werden als BUNDLED gesperrt.' },
              ] as { icon: IconName; label: string; sub: string }[]
            ).map(({ icon, label, sub }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0">
                  <Icon name={icon} size={17} />
                </span>
                <div>
                  <p className="text-body font-semibold text-ink">{label}</p>
                  <p className="text-label font-normal text-ink-faint">{sub}</p>
                </div>
              </div>
            ))}
          </div>
          <ButtonLink to="/bundles/new" block size="md" icon="plus">
            Erstes Bundle anlegen
          </ButtonLink>
        </Card>
      )}

      {sorted.length === 0 && entries && entries.length > 0 && (
        <EmptyState
          icon="search"
          title="Keine Bundles für diesen Filter."
          action={
            <Button variant="secondary" size="sm" onClick={() => setFilterPersist('alle')}>
              Filter zurücksetzen
            </Button>
          }
        />
      )}

      <div className="space-y-2">
        {sorted.map(({ bundle, listings, itemCount }) => {
          const activeListing = listings.find((l) =>
            l.projections.some((p) => p.status === 'ONLINE' || p.status === 'PUBLISHING'),
          );
          const anyListing = listings[0];
          return (
            <Link
              key={bundle.id}
              to={`/bundles/${bundle.id}`}
              className="block bg-surface border border-line rounded-card shadow-card p-4 hover:border-accent/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body font-semibold text-ink truncate">{bundle.title}</p>
                  {bundle.description && (
                    <p className="text-label font-normal text-ink-faint truncate">{bundle.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-label ${itemCount === 0 ? 'text-warning' : 'font-normal text-ink-faint'}`}>
                      {itemCount === 0 ? 'Leer' : `${itemCount} Artikel`}
                    </span>
                    {(activeListing ?? anyListing) ? (
                      <span className="text-label text-accent tabular-nums">
                        {(activeListing ?? anyListing)!.sellingPrice.toFixed(2)} €
                      </span>
                    ) : (
                      <span className="text-label font-normal text-ink-faint">Kein Listing</span>
                    )}
                    <span className="text-label font-normal text-ink-faint opacity-60">
                      · {relativeDate(bundle.createdAt)}
                    </span>
                  </div>
                </div>
                <PhaseBadge status={bundle.status} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
