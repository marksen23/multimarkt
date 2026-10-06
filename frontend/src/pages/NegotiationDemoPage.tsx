import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { ItemListEntry } from '../api/types';
import { ListSkeleton } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';

/**
 * Einstieg ohne Artikel-ID. Es gibt keine Beispielnachricht und keinen Chat.
 * Jeder Eintrag öffnet die Verhandlung des echten Artikels.
 */
export function NegotiationDemoPage() {
  const [entries, setEntries] = useState<ItemListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    itemsApi
      .list()
      .then(setEntries)
      .catch((e) => setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler'));
  }, []);

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-ink tracking-tight">Verhandlung</h1>
        <p className="text-sm text-ink-muted mt-1">
          Wähle einen Artikel. Danach fügst du die Käufernachricht ein. Es wird nichts gesendet.
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!entries && !error && <ListSkeleton />}
      {entries && entries.length === 0 && (
        <p className="text-sm text-ink-muted">Noch kein Artikel. Lege zuerst einen an.</p>
      )}
      {entries && entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.item.id}>
              <Link
                to={`/items/${entry.item.id}/verhandlung`}
                className="block bg-surface border border-line rounded-xl p-3 hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-ink line-clamp-1">
                    {entry.item.title?.trim() || 'Ohne Titel'}
                  </span>
                  <StatusBadge status={entry.item.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
