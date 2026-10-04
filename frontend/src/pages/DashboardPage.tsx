import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { ItemListEntry, ItemLifecycleState } from '../api/types';
import { ListSkeleton } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';

type FilterKey = 'alle' | 'handlung' | 'aktiv' | 'abgeschlossen';

const FILTER_LABELS: Record<FilterKey, string> = {
  alle: 'Alle',
  handlung: 'Handlung nötig',
  aktiv: 'Aktiv gelistet',
  abgeschlossen: 'Abgeschlossen',
};

const HANDLUNG_STATES: ItemLifecycleState[] = ['NEW', 'ANALYZING', 'REVIEW_REQUIRED', 'READY'];
const AKTIV_STATES: ItemLifecycleState[] = ['LISTED', 'SALE_CONFLICT'];
const ABGESCHLOSSEN_STATES: ItemLifecycleState[] = ['SOLD', 'CANCELLED', 'ARCHIVED', 'BUNDLED'];

function matchesFilter(entry: ItemListEntry, filter: FilterKey): boolean {
  const s = entry.item.status;
  if (filter === 'alle') return true;
  if (filter === 'handlung') return HANDLUNG_STATES.includes(s);
  if (filter === 'aktiv') return AKTIV_STATES.includes(s);
  if (filter === 'abgeschlossen') return ABGESCHLOSSEN_STATES.includes(s);
  return true;
}

export function DashboardPage() {
  const [entries, setEntries] = useState<ItemListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('alle');

  useEffect(() => {
    itemsApi
      .list()
      .then(setEntries)
      .catch((e) => setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler'));
  }, []);

  const stats = entries ? computeStats(entries) : null;
  const visible = entries?.filter((e) => matchesFilter(e, filter)) ?? null;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-ink tracking-tight">Dashboard</h1>
        <Link
          to="/new"
          className="px-4 py-2 rounded-full bg-accent text-accent-ink text-sm font-bold hover:bg-accent-hover transition-colors shadow-sm"
        >
          + Neuer Artikel
        </Link>
      </div>

      {error && (
        <div className="bg-danger-soft border border-danger/20 rounded-xl p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Handlung nötig"
            value={stats.handlungNoetig}
            highlight={stats.handlungNoetig > 0}
            onClick={() => setFilter('handlung')}
          />
          <StatCard
            label="Aktiv gelistet"
            value={stats.aktiv}
            onClick={() => setFilter('aktiv')}
          />
          <StatCard
            label="Erw. Erlös"
            value={stats.erwarteterErloes > 0 ? `${stats.erwarteterErloes.toFixed(0)} €` : '—'}
            onClick={() => setFilter('aktiv')}
          />
        </div>
      )}

      {/* Filter tabs */}
      {entries && entries.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => {
            const count = entries.filter((e) => matchesFilter(e, key)).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
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
      )}

      {!entries && !error && <ListSkeleton />}

      {entries && entries.length === 0 && (
        <div className="bg-surface border border-line rounded-2xl p-8 text-center space-y-2">
          <p className="text-sm text-ink-muted">Noch keine Artikel erfasst.</p>
          <Link to="/new" className="text-sm font-bold text-accent hover:text-accent-hover">
            Ersten Artikel anlegen
          </Link>
        </div>
      )}

      {visible && visible.length === 0 && entries && entries.length > 0 && (
        <div className="bg-surface border border-line rounded-2xl p-6 text-center">
          <p className="text-sm text-ink-muted">Keine Artikel in dieser Kategorie.</p>
        </div>
      )}

      <div className="space-y-2">
        {visible?.map(({ item, listings, thumbnailUrl }) => (
          <Link
            key={item.id}
            to={`/items/${item.id}`}
            className="block bg-surface border border-line rounded-2xl p-4 hover:border-accent/40 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {thumbnailUrl && (
                  <img
                    src={thumbnailUrl}
                    alt=""
                    className="w-12 h-12 rounded-xl object-cover border border-line shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="font-bold text-ink text-sm truncate">
                    {item.title ?? `Artikel ${item.id.slice(0, 8)}`}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {item.condition ?? 'Zustand noch nicht bestätigt'}
                  </p>
                </div>
              </div>
              <StatusBadge status={item.status} />
            </div>
            {listings.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {listings.flatMap((listing) =>
                  listing.projections.map((p) => (
                    <span
                      key={p.id}
                      className="text-[11px] px-2 py-1 rounded-lg bg-surface-hover border border-line text-ink-muted flex items-center gap-1"
                    >
                      {p.marketplaceId}
                      <StatusBadge status={p.status} />
                    </span>
                  )),
                )}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function computeStats(entries: ItemListEntry[]) {
  const handlungNoetig = entries.filter((e) =>
    (HANDLUNG_STATES as ItemLifecycleState[]).includes(e.item.status),
  ).length;
  const aktiv = entries.filter((e) =>
    (AKTIV_STATES as ItemLifecycleState[]).includes(e.item.status),
  ).length;
  const erwarteterErloes = entries
    .filter((e) => e.item.status === 'LISTED' && e.listings.length > 0)
    .reduce((sum, e) => sum + e.listings[0].sellingPrice, 0);
  return { handlungNoetig, aktiv, erwarteterErloes };
}

function StatCard({
  label,
  value,
  highlight,
  onClick,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-surface border border-line rounded-2xl p-3 text-left hover:border-accent/40 transition-colors w-full"
    >
      <p className={`text-lg font-extrabold ${highlight ? 'text-accent' : 'text-ink'}`}>
        {value}
      </p>
      <p className="text-[11px] text-ink-faint mt-0.5">{label}</p>
    </button>
  );
}
