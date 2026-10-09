import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bundlesApi } from '../api/bundles';
import { ApiRequestError } from '../api/client';
import type { BundleListEntry, BundleLifecycleState } from '../api/types';
import { ListSkeleton } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';

type FilterKey = 'alle' | 'aktiv' | 'abgeschlossen';
type SortKey = 'newest' | 'price-desc';

const FILTER_LABELS: Record<FilterKey, string> = {
  alle: 'Alle',
  aktiv: 'Aktiv',
  abgeschlossen: 'Abgeschlossen',
};

const ACTIVE_STATES: BundleLifecycleState[] = ['NEW', 'READY', 'LISTED'];
const CLOSED_STATES: BundleLifecycleState[] = ['SOLD', 'CANCELLED'];

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 2) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  if (hours < 24) return `vor ${hours} Std.`;
  if (days === 1) return 'gestern';
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 30) return `vor ${Math.floor(days / 7)} Wo.`;
  return new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

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
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-ink tracking-tight">Bundles</h1>
        <Link
          to="/bundles/new"
          className="px-4 py-2 rounded-full bg-accent text-accent-ink text-sm font-bold hover:bg-accent-hover transition-colors shadow-sm"
        >
          + Neues Bundle
        </Link>
      </div>

      {error && (
        <div className="bg-danger-soft border border-danger/20 rounded-xl p-4 text-sm text-danger">
          {error}
        </div>
      )}

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
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    filter === key
                      ? 'bg-accent text-accent-ink border-accent'
                      : 'bg-surface text-ink-muted border-line hover:border-accent hover:text-accent'
                  }`}
                >
                  {FILTER_LABELS[key]}
                  {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
                </button>
              );
            })}
          </div>
          <select
            value={sort}
            onChange={(e) => setSortPersist(e.target.value as SortKey)}
            className="flex-shrink-0 text-xs font-semibold text-ink-muted bg-surface border border-line rounded-xl px-2.5 py-1.5 outline-none focus:border-accent"
          >
            <option value="newest">Neueste</option>
            <option value="price-desc">Preis ↓</option>
          </select>
        </div>
      )}

      {!entries && !error && <ListSkeleton />}

      {entries && entries.length === 0 && (
        <div className="bg-surface border border-line rounded-2xl p-8 space-y-5">
          <div className="text-center space-y-1">
            <p className="text-base font-bold text-ink">Mehrere Artikel, ein Angebot</p>
            <p className="text-sm text-ink-muted">
              Sinnvoll für Artikel, die einzeln kaum Erlös bringen.
            </p>
          </div>
          <div className="space-y-2">
            {[
              { icon: '📦', label: 'Bundle anlegen', sub: 'Titel vergeben, bereite Artikel hinzufügen.' },
              { icon: '💶', label: 'Preis festlegen', sub: 'Gemeinsamer Preis für alle Artikel.' },
              { icon: '✓', label: 'Einmal verkaufen', sub: 'Alle Artikel werden als BUNDLED gesperrt.' },
            ].map(({ icon, label, sub }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-accent-soft flex items-center justify-center flex-shrink-0 text-sm select-none">
                  {icon}
                </div>
                <div>
                  <p className="text-sm font-bold text-ink">{label}</p>
                  <p className="text-xs text-ink-faint">{sub}</p>
                </div>
              </div>
            ))}
          </div>
          <Link
            to="/bundles/new"
            className="block w-full p-3 rounded-xl font-bold bg-accent text-accent-ink text-center hover:bg-accent-hover transition-colors"
          >
            + Erstes Bundle anlegen
          </Link>
        </div>
      )}

      {sorted.length === 0 && entries && entries.length > 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-ink-faint">Keine Bundles für diesen Filter.</p>
          <button
            type="button"
            onClick={() => setFilterPersist('alle')}
            className="mt-2 text-xs font-bold text-accent hover:text-accent-hover"
          >
            Filter zurücksetzen
          </button>
        </div>
      )}

      <div className="space-y-2">
        {sorted.map(({ bundle, listings, itemCount }) => {
          const activeListing = listings.find((l) =>
            l.projections.some((p) => p.status === 'ONLINE' || p.status === 'PUBLISHING'),
          );
          const anyListing = listings[0];
          const isActive = ACTIVE_STATES.includes(bundle.status);
          return (
            <Link
              key={bundle.id}
              to={`/bundles/${bundle.id}`}
              className="block bg-surface border border-line rounded-2xl p-4 hover:border-accent/40 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-ink text-sm truncate">{bundle.title}</p>
                  {bundle.description && (
                    <p className="text-xs text-ink-faint truncate">{bundle.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[11px] ${itemCount === 0 ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-ink-faint'}`}>
                      {itemCount === 0 ? 'Leer' : `${itemCount} Artikel`}
                    </span>
                    {(activeListing ?? anyListing) ? (
                      <span className="text-[11px] font-semibold text-accent">
                        {(activeListing ?? anyListing)!.sellingPrice.toFixed(2)} €
                      </span>
                    ) : (
                      <span className="text-[11px] text-ink-faint">Kein Listing</span>
                    )}
                    <span className="text-[11px] text-ink-faint opacity-60">
                      · {relativeDate(isActive ? bundle.createdAt : bundle.updatedAt)}
                    </span>
                  </div>
                </div>
                <StatusBadge status={bundle.status} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
