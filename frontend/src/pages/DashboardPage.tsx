import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { ItemListEntry, ItemLifecycleState } from '../api/types';
import { ListSkeleton } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';
import { usePendingActions } from '../contexts/PendingActionsContext';

type FilterKey = 'alle' | 'handlung' | 'aktiv' | 'abgeschlossen';

const MP_LABELS: Record<string, string> = {
  KLEINANZEIGEN: 'Kleinanzeigen',
  EBAY: 'eBay',
  VINTED: 'Vinted',
  FACEBOOK: 'Facebook',
};

const FILTER_LABELS: Record<FilterKey, string> = {
  alle: 'Alle',
  handlung: 'Handlung nötig',
  aktiv: 'Aktiv',
  abgeschlossen: 'Abgeschlossen',
};

const HANDLUNG_STATES: ItemLifecycleState[] = ['NEW', 'ANALYZING', 'REVIEW_REQUIRED', 'READY'];
const AKTIV_STATES: ItemLifecycleState[] = ['LISTED', 'SALE_CONFLICT', 'BUNDLED'];
const ABGESCHLOSSEN_STATES: ItemLifecycleState[] = ['SOLD', 'CANCELLED', 'ARCHIVED'];

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
  const [search, setSearch] = useState('');
  const { setPendingCount } = usePendingActions();

  useEffect(() => {
    itemsApi
      .list()
      .then((list) => {
        setEntries(list);
        const count = list.filter((e) => (HANDLUNG_STATES as ItemLifecycleState[]).includes(e.item.status)).length;
        setPendingCount(count);
      })
      .catch((e) => setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler'));
  }, [setPendingCount]);

  const stats = entries ? computeStats(entries) : null;
  const searchLower = search.trim().toLowerCase();
  const visible =
    entries?.filter(
      (e) =>
        matchesFilter(e, filter) &&
        (!searchLower ||
          (e.item.title ?? '').toLowerCase().includes(searchLower) ||
          (e.item.condition ?? '').toLowerCase().includes(searchLower)),
    ) ?? null;

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

      {/* Suche */}
      {entries && entries.length > 0 && (
        <div className="relative">
          <input
            type="search"
            placeholder="Artikel suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-line rounded-xl text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft bg-transparent text-ink placeholder:text-ink-faint"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-muted text-xs"
              aria-label="Suche zurücksetzen"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard
            label="Handlung nötig"
            value={stats.handlungNoetig}
            highlight={stats.handlungNoetig > 0}
            onClick={() => setFilter('handlung')}
          />
          <StatCard
            label="Aktiv"
            value={stats.aktiv}
            onClick={() => setFilter('aktiv')}
          />
          <StatCard
            label="Verkauft"
            value={stats.verkauft}
            onClick={() => setFilter('abgeschlossen')}
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

      {entries && entries.length === 0 && <EmptyState />}

      {visible && visible.length === 0 && entries && entries.length > 0 && (
        <div className="bg-surface border border-line rounded-2xl p-6 text-center space-y-2">
          <p className="text-sm text-ink-muted">
            {search.trim()
              ? `Keine Ergebnisse für „${search.trim()}"`
              : 'Keine Artikel in dieser Kategorie.'}
          </p>
          {(filter !== 'alle' || search.trim()) && (
            <button
              type="button"
              onClick={() => { setFilter('alle'); setSearch(''); }}
              className="text-xs font-bold text-accent hover:text-accent-hover"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        {visible?.map(({ item, listings, thumbnailUrl }) => (
          <Link
            key={item.id}
            to={`/items/${item.id}`}
            className={`block bg-surface rounded-2xl p-4 hover:shadow-md transition border ${
              item.status === 'READY'
                ? 'border-accent/40 ring-1 ring-accent/20'
                : item.status === 'REVIEW_REQUIRED'
                ? 'border-amber-400/50'
                : item.status === 'SALE_CONFLICT'
                ? 'border-danger/40'
                : 'border-line hover:border-accent/40'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt=""
                    className="w-12 h-12 rounded-xl object-cover border border-line shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-surface-hover border border-line shrink-0 flex items-center justify-center text-xl select-none">
                    📷
                  </div>
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
              <div className="flex flex-col items-end gap-1 shrink-0">
                <StatusBadge status={item.status} />
                {listings.length > 0 &&
                  (item.status === 'LISTED' || item.status === 'SOLD' || item.status === 'SALE_CONFLICT') && (
                  <span className="text-[11px] font-semibold text-ink-muted">
                    {listings[0].sellingPrice.toFixed(2)} €
                  </span>
                )}
              </div>
            </div>
            {item.status === 'BUNDLED' && (
              <div className="mt-3">
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-surface-hover border border-line text-ink-muted">
                  📦 <span className="font-medium">Bundle</span>
                </span>
              </div>
            )}
            {item.status === 'SALE_CONFLICT' && (
              <div className="mt-3">
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-danger-soft border border-danger/20 text-danger font-medium">
                  ⚠ Konflikt lösen
                </span>
              </div>
            )}
            {listings.length > 0 && item.status !== 'BUNDLED' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {listings.flatMap((listing) =>
                  listing.projections.map((p) => (
                    <span
                      key={p.id}
                      className="text-[11px] px-2 py-1 rounded-lg bg-surface-hover border border-line text-ink-muted flex items-center gap-1.5"
                    >
                      <span className="font-medium">{MP_LABELS[p.marketplaceId] ?? p.marketplaceId}</span>
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
  const verkauft = entries.filter((e) => e.item.status === 'SOLD').length;
  const erwarteterErloes = entries
    .filter((e) => e.item.status === 'LISTED' && e.listings.length > 0)
    .reduce((sum, e) => sum + e.listings[0].sellingPrice, 0);
  return { handlungNoetig, aktiv, verkauft, erwarteterErloes };
}

function EmptyState() {
  return (
    <div className="bg-surface border border-line rounded-2xl p-8 space-y-6">
      <div className="text-center space-y-1">
        <p className="text-base font-bold text-ink">Dein erster Artikel</p>
        <p className="text-sm text-ink-muted">Foto machen — der Rest geht von selbst.</p>
      </div>

      <div className="space-y-3">
        {[
          { step: '1', icon: CameraIcon, label: 'Foto aufnehmen', sub: 'Artikel fotografieren, fertig.' },
          { step: '2', icon: SparkIcon, label: 'KI analysiert', sub: 'Titel, Zustand, Preis — automatisch.' },
          { step: '3', icon: CopyIcon, label: 'Texte kopieren', sub: 'Fertige Angebote für jedes Portal.' },
        ].map(({ step, icon: Icon, label, sub }) => (
          <div key={step} className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-accent-soft flex items-center justify-center flex-shrink-0">
              <Icon />
            </div>
            <div>
              <p className="text-sm font-bold text-ink">{label}</p>
              <p className="text-xs text-ink-faint">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      <Link
        to="/new"
        className="block w-full p-3 rounded-xl font-bold bg-accent text-accent-ink text-center hover:bg-accent-hover transition-colors"
      >
        + Ersten Artikel anlegen
      </Link>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden="true">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
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
