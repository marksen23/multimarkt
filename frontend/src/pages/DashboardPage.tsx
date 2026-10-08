import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { ItemListEntry } from '../api/types';
import { ListSkeleton } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';

export function DashboardPage() {
  const [entries, setEntries] = useState<ItemListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    itemsApi
      .list()
      .then(setEntries)
      .catch((e) => setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler'));
  }, []);

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

      {!entries && !error && <ListSkeleton />}

      {entries && entries.length === 0 && (
        <div className="bg-surface border border-line rounded-2xl p-8 text-center space-y-2">
          <p className="text-sm text-ink-muted">Noch keine Artikel erfasst.</p>
          <Link to="/new" className="text-sm font-bold text-accent hover:text-accent-hover">
            Ersten Artikel anlegen
          </Link>
        </div>
      )}

      <div className="space-y-2">
        {entries?.map(({ item, listings, thumbnailUrl }) => (
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
    </div>
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
