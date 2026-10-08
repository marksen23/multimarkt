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

      <div className="space-y-2">
        {entries?.map(({ bundle, listings, itemCount }) => {
          const activeListing = listings.find((l) =>
            l.projections.some((p) => p.status === 'ONLINE' || p.status === 'PUBLISHING'),
          );
          const anyListing = listings[0];
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
