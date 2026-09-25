import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { ItemListEntry } from '../api/types';
import { StatusBadge } from '../components/StatusBadge';

/**
 * Zentrales Dashboard (README §5: "Status pro Listing pro Plattform"). Nutzt
 * `GET /items` — eine bewusste, dokumentierte Erweiterung von Doc 04 (siehe
 * items.controller.ts), da der eingefrorene Vertrag dafür keinen
 * Listen-Endpoint vorsah.
 */
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

      {!entries && !error && <p className="text-sm text-ink-faint">Lädt…</p>}

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
