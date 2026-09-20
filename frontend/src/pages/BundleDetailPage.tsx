import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { bundlesApi } from '../api/bundles';
import { ApiRequestError } from '../api/client';
import type { BundleDetail } from '../api/types';
import { StatusBadge } from '../components/StatusBadge';

export function BundleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<BundleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      setDetail(await bundlesApi.get(id));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!detail || !id) {
    return (
      <div className="p-6 text-center text-sm text-gray-400">{error ?? 'Lädt…'}</div>
    );
  }

  const { bundle, items, listings } = detail;

  const prepareListing = async () => {
    setBusy(true);
    setError(null);
    try {
      await bundlesApi.prepareListing(id, Number(price), description);
      await reload();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <Link to="/bundles" className="text-xs text-gray-400 hover:text-gray-600">
        ← Bundles
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">{bundle.title}</h1>
        <StatusBadge status={bundle.status} />
      </div>
      {bundle.description && <p className="text-sm text-gray-500">{bundle.description}</p>}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div>
        <p className="text-xs font-bold text-gray-500 uppercase mb-2">
          Enthaltene Artikel ({items.length})
        </p>
        <div className="space-y-1">
          {items.map((item) => (
            <Link
              key={item.id}
              to={`/items/${item.id}`}
              className="block bg-white border border-gray-200 rounded-lg p-2 text-sm hover:border-gray-400"
            >
              {item.title ?? `Artikel ${item.id.slice(0, 8)}`}
            </Link>
          ))}
        </div>
      </div>

      {listings.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase mb-2">Listings</p>
          {listings.map((listing) => (
            <div key={listing.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="font-bold text-gray-900">{listing.sellingPrice.toFixed(2)} €</p>
              <p className="text-xs text-gray-500 mb-2">{listing.descriptionText}</p>
              <div className="flex flex-wrap gap-2">
                {listing.projections.map((p) => (
                  <span
                    key={p.id}
                    className="text-[11px] px-2 py-1 rounded-lg bg-gray-50 border border-gray-100 text-gray-600 flex items-center gap-1"
                  >
                    {p.marketplaceId}
                    <StatusBadge status={p.status} />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {bundle.status === 'READY' && listings.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase">Listing anlegen</p>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Preis in €"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full p-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-black"
          />
          <textarea
            rows={3}
            placeholder="Beschreibung"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-black"
          />
          <button
            type="button"
            disabled={busy || !price || !description}
            onClick={prepareListing}
            className="w-full p-3 rounded-lg font-bold bg-black text-white disabled:bg-gray-300"
          >
            {busy ? 'Wird angelegt…' : 'Listing anlegen'}
          </button>
        </div>
      )}
    </div>
  );
}
