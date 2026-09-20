import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bundlesApi } from '../api/bundles';
import { ApiRequestError } from '../api/client';
import type { BundleListEntry } from '../api/types';
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
        <h1 className="text-lg font-bold text-gray-900">Bundles</h1>
        <Link
          to="/bundles/new"
          className="px-4 py-2 rounded-lg bg-black text-white text-sm font-bold hover:bg-gray-800"
        >
          + Neues Bundle
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {entries && entries.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center space-y-2">
          <p className="text-sm text-gray-500">
            Noch keine Bundles. Sinnvoll für Artikel, die einzeln kaum Erlös bringen.
          </p>
          <Link to="/bundles/new" className="text-sm font-bold text-black underline">
            Erstes Bundle anlegen
          </Link>
        </div>
      )}

      <div className="space-y-2">
        {entries?.map(({ bundle }) => (
          <Link
            key={bundle.id}
            to={`/bundles/${bundle.id}`}
            className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-400 transition"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900 text-sm">{bundle.title}</p>
                {bundle.description && (
                  <p className="text-xs text-gray-400">{bundle.description}</p>
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
