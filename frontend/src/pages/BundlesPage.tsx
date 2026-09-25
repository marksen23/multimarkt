import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bundlesApi } from '../api/bundles';
import { ApiRequestError } from '../api/client';
import type { BundleListEntry } from '../api/types';
import { ListSkeleton } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';

export function BundlesPage() {
  const [entries, setEntries] = useState<BundleListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bundlesApi
      .list()
      .then(setEntries)
      .catch((e) => setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler'));
  }, []);

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

      {!entries && !error && <ListSkeleton />}

      {entries && entries.length === 0 && (
        <div className="bg-surface border border-line rounded-2xl p-8 text-center space-y-2">
          <p className="text-sm text-ink-muted">
            Noch keine Bundles. Sinnvoll für Artikel, die einzeln kaum Erlös bringen.
          </p>
          <Link to="/bundles/new" className="text-sm font-bold text-accent hover:text-accent-hover">
            Erstes Bundle anlegen
          </Link>
        </div>
      )}

      <div className="space-y-2">
        {entries?.map(({ bundle }) => (
          <Link
            key={bundle.id}
            to={`/bundles/${bundle.id}`}
            className="block bg-surface border border-line rounded-2xl p-4 hover:border-accent/40 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-ink text-sm">{bundle.title}</p>
                {bundle.description && (
                  <p className="text-xs text-ink-faint">{bundle.description}</p>
                )}
              </div>
              <StatusBadge status={bundle.status} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
