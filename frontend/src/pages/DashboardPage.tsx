import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { ItemListEntry } from '../api/types';
import { ListSkeleton } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';

const STATUS_FILTERS = [
  { value: '', label: 'Alle' },
  { value: 'REVIEW_REQUIRED', label: 'Prüfen' },
  { value: 'READY', label: 'Bereit' },
  { value: 'LISTED', label: 'Online' },
  { value: 'SOLD', label: 'Verkauft' },
] as const;

export function DashboardPage() {
  const [entries, setEntries] = useState<ItemListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    itemsApi
      .list()
      .then(setEntries)
      .catch((e) => setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler'));
  }, []);

  const CLOSED_STATES = ['SOLD', 'ARCHIVED', 'CANCELLED'] as const;
  type ClosedState = typeof CLOSED_STATES[number];

  const filtered = entries?.filter((e) => {
    if (statusFilter && e.item.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (e.item.title ?? '').toLowerCase().includes(q) ||
        (e.item.condition ?? '').toLowerCase().includes(q) ||
        e.item.id.startsWith(q)
      );
    }
    return true;
  });

  const isFiltering = search.trim() !== '' || statusFilter !== '';
  const activeEntries = isFiltering
    ? (filtered ?? [])
    : (entries?.filter((e) => !CLOSED_STATES.includes(e.item.status as ClosedState)) ?? []);
  const closedEntries = isFiltering
    ? []
    : (entries?.filter((e) => CLOSED_STATES.includes(e.item.status as ClosedState)) ?? []);

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

      {entries && entries.length > 0 && <StatsBar entries={entries} />}

      {/* Search + filter — only show once we have data */}
      {entries && entries.length > 0 && (
        <div className="space-y-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint text-sm select-none">🔍</span>
            <input
              type="search"
              placeholder="Artikel suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-surface border border-line rounded-xl text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  statusFilter === f.value
                    ? 'bg-accent text-accent-ink'
                    : 'bg-surface border border-line text-ink-muted hover:bg-surface-hover'
                }`}
              >
                {f.label}
                {f.value && entries && (
                  <span className="ml-1 opacity-60">
                    ({entries.filter((e) => e.item.status === f.value).length})
                  </span>
                )}
              </button>
            ))}
          </div>
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

      {isFiltering && activeEntries.length === 0 && entries && entries.length > 0 && (
        <div className="bg-surface border border-line rounded-2xl p-6 text-center">
          <p className="text-sm text-ink-muted">Keine Artikel für diese Suche gefunden.</p>
          <button
            type="button"
            onClick={() => { setSearch(''); setStatusFilter(''); }}
            className="mt-2 text-sm font-bold text-accent hover:text-accent-hover"
          >
            Filter zurücksetzen
          </button>
        </div>
      )}

      <div className="space-y-2">
        {activeEntries.map(({ item, listings, thumbnailUrl }) => (
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

      {closedEntries.length > 0 && <ClosedSection entries={closedEntries} />}
    </div>
  );
}

// ─── Stats ───────────────────────────────────────────────────────────────────

function StatsBar({ entries }: { entries: ItemListEntry[] }) {
  const pipeline = entries.filter(
    (e) =>
      e.item.status === 'NEW' ||
      e.item.status === 'ANALYZING' ||
      e.item.status === 'REVIEW_REQUIRED',
  ).length;
  const ready = entries.filter((e) => e.item.status === 'READY').length;
  const listed = entries.filter((e) => e.item.status === 'LISTED').length;
  const sold = entries.filter((e) => e.item.status === 'SOLD').length;
  const conflict = entries.filter((e) => e.item.status === 'SALE_CONFLICT').length;

  const lagerwert = entries
    .filter((e) => e.item.status === 'READY' || e.item.status === 'LISTED')
    .reduce((sum, e) => sum + (e.listings[0]?.sellingPrice ?? 0), 0);

  const lagerwertFormatted =
    lagerwert > 0
      ? lagerwert.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
      : '—';

  const erlös = entries
    .filter((e) => e.item.status === 'SOLD')
    .reduce((sum, e) => sum + (e.listings[0]?.sellingPrice ?? 0), 0);
  const erlösFormatted =
    erlös > 0
      ? erlös.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
      : null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile
          label="Pipeline"
          value={pipeline}
          sub={pipeline === 1 ? 'Artikel' : 'Artikel'}
          dim={pipeline === 0}
        />
        <StatTile
          label="Bereit"
          value={ready}
          sub={ready === 1 ? 'Artikel' : 'Artikel'}
          dim={ready === 0}
        />
        <StatTile
          label="Online"
          value={listed}
          sub={listed === 1 ? 'Listing' : 'Listings'}
          highlight={listed > 0}
          dim={listed === 0}
        />
        <StatTile
          label="Verkauft"
          value={sold}
          sub={sold === 1 ? 'Artikel' : 'Artikel'}
          dim={sold === 0}
        />
      </div>
      <div className="bg-surface border border-line rounded-xl px-4 py-3 flex items-center justify-between">
        <span className="text-xs font-bold text-ink-muted uppercase tracking-wide">
          Lagerwert (Bereit + Online)
        </span>
        <div className="flex items-center gap-3">
          {conflict > 0 && (
            <span className="text-xs font-bold text-danger">
              ⚠ {conflict} Konflikt{conflict > 1 ? 'e' : ''}
            </span>
          )}
          <span className={`text-lg font-extrabold tabular-nums ${lagerwert > 0 ? 'text-accent' : 'text-ink-faint'}`}>
            {lagerwertFormatted}
          </span>
        </div>
      </div>
      {erlösFormatted && (
        <div className="bg-surface border border-line rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-bold text-ink-muted uppercase tracking-wide">Erlös (Verkauft)</span>
          <span className="text-lg font-extrabold tabular-nums text-ink">{erlösFormatted}</span>
        </div>
      )}
    </div>
  );
}

// ─── Closed items section ─────────────────────────────────────────────────────

function exportSoldCsv(entries: ItemListEntry[]) {
  const sold = entries.filter((e) => e.item.status === 'SOLD');
  if (sold.length === 0) return;
  const rows: string[][] = [['Titel', 'Zustand', 'Listingpreis (€)', 'Erstellt', 'Aktualisiert']];
  for (const { item, listings } of sold) {
    rows.push([
      item.title ?? item.id,
      item.condition ?? '',
      listings[0]?.sellingPrice?.toFixed(2) ?? '',
      new Date(item.createdAt).toLocaleDateString('de-DE'),
      new Date(item.updatedAt).toLocaleDateString('de-DE'),
    ]);
  }
  const csv = rows
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `verkaufshistorie-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ClosedSection({ entries }: { entries: ItemListEntry[] }) {
  const soldEntries = entries.filter((e) => e.item.status === 'SOLD');
  const soldRevenue = soldEntries.reduce((sum, e) => sum + (e.listings[0]?.sellingPrice ?? 0), 0);
  const revenueLabel =
    soldRevenue > 0
      ? `${soldRevenue.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`
      : null;

  return (
    <details className="group">
      <summary className="flex items-center justify-between cursor-pointer list-none py-2 px-1 select-none">
        <span className="text-xs font-bold text-ink-muted uppercase tracking-wide">
          Abgeschlossen ({entries.length})
        </span>
        <div className="flex items-center gap-3">
          {revenueLabel && (
            <span className="text-xs text-ink-faint">Erlös: {revenueLabel}</span>
          )}
          {soldEntries.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); exportSoldCsv(entries); }}
              className="text-[11px] font-bold text-ink-faint hover:text-accent transition-colors py-1 px-1"
            >
              CSV ↓
            </button>
          )}
          <span className="text-ink-faint text-xs group-open:hidden">▼</span>
          <span className="text-ink-faint text-xs hidden group-open:inline">▲</span>
        </div>
      </summary>
      <div className="space-y-2 mt-2">
        {entries.map(({ item, listings, thumbnailUrl }) => (
          <Link
            key={item.id}
            to={`/items/${item.id}`}
            className="flex items-center justify-between gap-3 bg-surface border border-line rounded-2xl px-4 py-3 hover:border-accent/30 transition opacity-60 hover:opacity-80"
          >
            <div className="flex items-center gap-3 min-w-0">
              {thumbnailUrl && (
                <img
                  src={thumbnailUrl}
                  alt=""
                  className="w-10 h-10 rounded-xl object-cover border border-line shrink-0"
                />
              )}
              <div className="min-w-0">
                <p className="font-bold text-ink text-sm truncate">
                  {item.title ?? `Artikel ${item.id.slice(0, 8)}`}
                </p>
                {listings[0]?.sellingPrice != null && (
                  <p className="text-xs text-ink-faint tabular-nums">
                    {listings[0].sellingPrice.toFixed(2)} €
                  </p>
                )}
              </div>
            </div>
            <StatusBadge status={item.status} />
          </Link>
        ))}
      </div>
    </details>
  );
}

function StatTile({
  label,
  value,
  sub,
  highlight,
  dim,
}: {
  label: string;
  value: number;
  sub: string;
  highlight?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="bg-surface border border-line rounded-xl p-3 text-center">
      <div
        className={`text-2xl font-extrabold tabular-nums leading-none ${
          highlight ? 'text-accent' : dim ? 'text-ink-faint' : 'text-ink'
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] font-bold text-ink-muted uppercase tracking-wide mt-1">{label}</div>
      <div className="text-[10px] text-ink-faint">{sub}</div>
    </div>
  );
}
