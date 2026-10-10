import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { bundlesApi } from '../api/bundles';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { BundleDetail, Item, ItemListEntry } from '../api/types';
import { ListingsManager } from '../components/ListingsManager';
import { DetailPageSkeleton } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';

function AddItemsSection({
  bundleId,
  busy,
  run,
}: {
  bundleId: string;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [readyItems, setReadyItems] = useState<ItemListEntry[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    itemsApi.list('READY').then(setReadyItems).catch(() => setReadyItems([]));
  }, []);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const add = () => run(() => bundlesApi.addItems(bundleId, Array.from(selected)));

  return (
    <div className="bg-surface border border-accent/30 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-ink-muted uppercase">Bereite Artikel hinzufügen</p>
        {readyItems && readyItems.length > 1 && (
          <button
            type="button"
            onClick={() =>
              setSelected(
                selected.size === readyItems.length
                  ? new Set()
                  : new Set(readyItems.map(({ item }) => item.id)),
              )
            }
            className="text-xs font-bold text-accent hover:text-accent-hover transition-colors"
          >
            {selected.size === readyItems.length ? 'Keine' : 'Alle'}
          </button>
        )}
      </div>
      {readyItems === null && (
        <div className="flex items-center gap-2 text-xs text-ink-faint">
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
          Artikel werden geladen…
        </div>
      )}
      {readyItems?.length === 0 && (
        <p className="text-xs text-ink-faint">
          Noch keine bereiten Artikel vorhanden. Artikel zuerst analysieren und bestätigen.
        </p>
      )}
      <div className="space-y-1">
        {readyItems?.map(({ item }) => (
          <label
            key={item.id}
            className={`flex items-center gap-3 bg-surface border rounded-xl px-3 py-2.5 text-sm text-ink cursor-pointer transition ${
              selected.has(item.id) ? 'border-accent/60 bg-accent-soft/30' : 'border-line hover:border-accent/40'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              onChange={() => toggle(item.id)}
              className="accent-accent"
            />
            <div className="min-w-0">
              <p className="font-medium truncate">{item.title ?? `Artikel ${item.id.slice(0, 8)}`}</p>
              {item.condition && <p className="text-[11px] text-ink-faint">{item.condition}</p>}
            </div>
          </label>
        ))}
      </div>
      {(readyItems?.length ?? 0) > 0 && (
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={add}
          className="w-full p-3 rounded-xl font-bold bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
        >
          {busy
            ? 'Wird hinzugefügt…'
            : selected.size > 0
              ? `${selected.size} ${selected.size === 1 ? 'Artikel' : 'Artikel'} hinzufügen → Bundle bereit`
              : 'Artikel auswählen'}
        </button>
      )}
    </div>
  );
}

function buildBundleDescription(items: Item[]): string {
  const lines = items.map((item) => {
    const name = item.title ?? `Artikel ${item.id.slice(0, 6)}`;
    return item.condition ? `• ${name} (${item.condition})` : `• ${name}`;
  });
  return [
    `Angebotspaket mit ${items.length} ${items.length === 1 ? 'Artikel' : 'Artikeln'}:`,
    '',
    ...lines,
    '',
    'Alle Artikel aus privater Hand, keine Garantie oder Rücknahme.',
  ].join('\n');
}

export function BundleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
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

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      const msg = e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!detail || !id) {
    if (error) {
      return <div className="p-6 text-center text-sm text-danger">{error}</div>;
    }
    return <DetailPageSkeleton />;
  }

  const { bundle, items, listings } = detail;

  const prepareListing = () =>
    run(() => bundlesApi.prepareListing(id, Number(price), description));

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <Link to="/bundles" className="text-xs text-ink-faint hover:text-ink-muted">
        ← Bundles
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink">{bundle.title}</h1>
        <StatusBadge status={bundle.status} />
      </div>
      {bundle.description && <p className="text-sm text-ink-muted">{bundle.description}</p>}

      {error && <p className="text-xs text-danger">{error}</p>}

      <div>
        <p className="text-xs font-bold text-ink-muted uppercase mb-2">
          Enthaltene Artikel ({items.length})
        </p>
        {items.length === 0 && bundle.status !== 'NEW' ? (
          <div className="bg-surface border border-dashed border-line rounded-xl px-4 py-6 text-center">
            <p className="text-sm text-ink-muted">Noch keine Artikel in diesem Bundle.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <Link
                key={item.id}
                to={`/items/${item.id}`}
                className="flex items-center justify-between bg-surface border border-line rounded-xl px-3 py-2 hover:border-accent/40 transition"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink font-medium truncate">
                    {item.title ?? `Artikel ${item.id.slice(0, 8)}`}
                  </p>
                  {item.condition && (
                    <p className="text-[11px] text-ink-faint">{item.condition}</p>
                  )}
                </div>
                <StatusBadge status={item.status} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {bundle.status === 'NEW' && id && (
        <AddItemsSection bundleId={id} busy={busy} run={run} />
      )}

      {listings.length > 0 && (
        <div>
          <p className="text-xs font-bold text-ink-muted uppercase mb-2">Listings</p>
          <ListingsManager
            listings={listings}
            busy={busy}
            run={run}
            emptyLabel="Noch kein Canonical Listing vorhanden."
          />
        </div>
      )}

      {bundle.status === 'READY' && listings.length === 0 && (
        <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-ink-muted uppercase">Listing anlegen</p>

          {/* Description with suggestion button */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-ink-muted font-medium">Beschreibung</label>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDescription(buildBundleDescription(items))}
                  className="text-xs font-bold text-accent hover:text-accent-hover transition-colors"
                >
                  ✨ Vorschlag generieren
                </button>
              )}
            </div>
            <textarea
              rows={5}
              placeholder="Beschreibung des Bundles…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 border border-line rounded-xl text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition resize-none"
            />
            <div className="flex items-center justify-between px-0.5">
              <div className="flex-1 h-0.5 rounded-full bg-line overflow-hidden mr-3">
                <div
                  className={`h-full rounded-full transition-all ${description.length > 1500 ? 'bg-danger' : 'bg-accent'}`}
                  style={{ width: `${Math.min((description.length / 1500) * 100, 100)}%` }}
                />
              </div>
              <span className={`text-[11px] tabular-nums flex-shrink-0 ${description.length > 1500 ? 'text-danger font-bold' : 'text-ink-faint'}`}>
                {description.length} / 1500
              </span>
            </div>
          </div>

          {/* Price */}
          <div className="space-y-1.5">
            <label className="text-xs text-ink-muted font-medium">Preis (€)</label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="z. B. 29.99"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full p-3 border border-line rounded-xl text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition"
            />
          </div>

          <button
            type="button"
            disabled={busy || !price || !description || description.length > 1500}
            onClick={prepareListing}
            className="w-full p-3 rounded-xl font-bold bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
          >
            {busy ? 'Wird angelegt…' : 'Listing anlegen'}
          </button>
        </div>
      )}
    </div>
  );
}
