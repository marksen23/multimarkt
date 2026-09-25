import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
      <h1 className="text-xl font-extrabold text-ink tracking-tight">Neues Bundle</h1>
      <input
        type="text"
        placeholder="Titel, z.B. „Kinderkleidung Gr. 98“"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full p-3 border border-line rounded-xl text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition"
      />

      <div>
        <p className="text-xs font-bold text-ink-muted uppercase mb-2">
          Bereite Artikel auswählen (optional)
        </p>
        {readyItems?.length === 0 && (
          <p className="text-xs text-ink-faint">
            Keine Artikel im Status READY — Bundle kann trotzdem leer angelegt werden.
          </p>
        )}
        <div className="space-y-1">
          {readyItems?.map(({ item }) => (
            <label
              key={item.id}
              className="flex items-center gap-2 bg-surface border border-line rounded-xl p-2 text-sm text-ink cursor-pointer hover:border-accent/40 transition"
            >
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggle(item.id)}
              />
              {item.title ?? `Artikel ${item.id.slice(0, 8)}`}
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
        {creating ? 'Wird erstellt…' : 'Bundle anlegen'}
      </button>
    </div>
  );
}
