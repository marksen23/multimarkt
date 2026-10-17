import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { ItemListEntry } from '../api/types';
import { ListSkeleton } from '../components/Skeleton';
import { Notice, PageHeader, PhaseBadge } from '../ui';

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
      <PageHeader
        title="Verhandlung"
        subtitle="Wähle einen Artikel. Danach fügst du die Käufernachricht ein. Es wird nichts gesendet."
      />

      {error && <Notice tone="danger">{error}</Notice>}
      {!entries && !error && <ListSkeleton />}
      {entries && entries.length === 0 && (
        <p className="text-body text-ink-muted">Noch kein Artikel. Lege zuerst einen an.</p>
      )}
      {entries && entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.item.id}>
              <Link
                to={`/items/${entry.item.id}/verhandlung`}
                className="block bg-surface border border-line rounded-control shadow-card p-3 hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body font-bold text-ink line-clamp-1">
                    {entry.item.title?.trim() || 'Ohne Titel'}
                  </span>
                  <PhaseBadge status={entry.item.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
