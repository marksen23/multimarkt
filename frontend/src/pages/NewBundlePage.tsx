import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { bundlesApi } from '../api/bundles';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { ItemListEntry } from '../api/types';

/** Nur READY-Items sind bündelbar (Doc 02 §11 Precondition, StateGuardService). */
export function NewBundlePage() {
  const [title, setTitle] = useState('');
  const [readyItems, setReadyItems] = useState<ItemListEntry[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    itemsApi
      .list('READY')
      .then(setReadyItems)
      .catch((e) => setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler'));
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const bundle = await bundlesApi.create(title);
      if (selected.size > 0) {
        await bundlesApi.addItems(bundle.id, Array.from(selected));
      }
      navigate(`/bundles/${bundle.id}`);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <Link to="/bundles" className="block text-xs text-ink-faint hover:text-ink-muted">
        ← Bundles
      </Link>
      <h1 className="text-xl font-extrabold text-ink tracking-tight">Neues Bundle</h1>
      <input
        type="text"
        placeholder="Titel, z.B. „Kinderkleidung Gr. 98“"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        className="w-full p-3 border border-line rounded-xl text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition"
      />

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-ink-muted uppercase">
            Bereite Artikel auswählen (optional)
          </p>
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
          <div className="flex items-center gap-2 text-xs text-ink-faint py-1">
            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
            Artikel werden geladen…
          </div>
        )}
        {readyItems?.length === 0 && (
          <p className="text-xs text-ink-faint">
            Noch keine bereiten Artikel vorhanden — Bundle kann trotzdem leer angelegt werden.
          </p>
        )}
        <div className="space-y-1">
          {readyItems?.map(({ item }) => (
            <label
              key={item.id}
              className={`flex items-center gap-3 bg-surface border rounded-xl px-3 py-2.5 text-sm text-ink cursor-pointer transition ${
                selected.has(item.id)
                  ? 'border-accent/60 bg-accent-soft/30'
                  : 'border-line hover:border-accent/40'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggle(item.id)}
                className="accent-accent"
              />
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {item.title ?? `Artikel ${item.id.slice(0, 8)}`}
                </p>
                {item.condition && (
                  <p className="text-[11px] text-ink-faint">{item.condition}</p>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <button
        type="button"
        disabled={creating || !title}
        onClick={create}
        className="w-full p-3 rounded-xl font-bold bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
      >
        {creating
          ? 'Wird erstellt…'
          : selected.size > 0
            ? `Bundle anlegen (${selected.size} ${selected.size === 1 ? 'Artikel' : 'Artikel'})`
            : 'Bundle anlegen'}
      </button>
    </div>
  );
}
