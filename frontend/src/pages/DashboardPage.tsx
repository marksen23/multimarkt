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
        <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
        <Link
          to="/new"
          className="px-4 py-2 rounded-lg bg-black text-white text-sm font-bold hover:bg-gray-800"
        >
          + Neuer Artikel
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!entries && !error && <p className="text-sm text-gray-400">Lädt…</p>}

      {entries && entries.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center space-y-2">
          <p className="text-sm text-gray-500">Noch keine Artikel erfasst.</p>
          <Link to="/new" className="text-sm font-bold text-black underline">
            Ersten Artikel anlegen
          </Link>
        </div>
      )}

      <div className="space-y-2">
        {entries?.map(({ item, listings }) => (
          <Link
            key={item.id}
            to={`/items/${item.id}`}
            className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-400 transition"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900 text-sm">
                  {item.title ?? `Artikel ${item.id.slice(0, 8)}`}
                </p>
                <p className="text-xs text-gray-400">
                  {item.condition ?? 'Zustand noch nicht bestätigt'}
                </p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            {listings.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {listings.flatMap((listing) =>
                  listing.projections.map((p) => (
                    <span
                      key={p.id}
                      className="text-[11px] px-2 py-1 rounded-lg bg-gray-50 border border-gray-100 text-gray-600 flex items-center gap-1"
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
