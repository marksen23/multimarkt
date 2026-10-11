import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { bundlesApi } from '../api/bundles';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { ItemListEntry } from '../api/types';
import { ActionBar, Button, PageHeader, SectionLabel, Spinner, inputClass } from '../ui';

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
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-4">
      <Link to="/bundles" className="inline-block text-label font-normal text-ink-faint hover:text-ink-muted">
        ← Bundles
      </Link>
      <PageHeader title="Neues Bundle" />
      <input
        type="text"
        placeholder="Titel, z.B. „Kinderkleidung Gr. 98“"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        className={inputClass}
      />

      <section>
        <SectionLabel
          action={
            readyItems && readyItems.length > 1 ? (
              <button
                type="button"
                onClick={() =>
                  setSelected(
                    selected.size === readyItems.length
                      ? new Set()
                      : new Set(readyItems.map(({ item }) => item.id)),
                  )
                }
                className="text-label text-accent hover:text-accent-hover transition-colors"
              >
                {selected.size === readyItems.length ? 'Keine' : 'Alle'}
              </button>
            ) : undefined
          }
        >
          Bereite Artikel auswählen (optional)
        </SectionLabel>
        {readyItems === null && (
          <div className="flex items-center gap-2 text-label font-normal text-ink-faint py-1">
            <Spinner />
            Artikel werden geladen…
          </div>
        )}
        {readyItems?.length === 0 && (
          <p className="text-label font-normal text-ink-faint">
            Noch keine bereiten Artikel vorhanden — Bundle kann trotzdem leer angelegt werden.
          </p>
        )}
        <div className="space-y-1.5">
          {readyItems?.map(({ item }) => (
            <label
              key={item.id}
              className={`flex items-center gap-3 bg-surface border rounded-control px-3 py-2.5 text-body text-ink cursor-pointer transition ${
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
                  <p className="text-label font-normal text-ink-faint">{item.condition}</p>
                )}
              </div>
            </label>
          ))}
        </div>
      </section>

      {error && <p className="text-label text-danger">{error}</p>}

      <ActionBar>
        <Button size="lg" disabled={creating || !title} onClick={create}>
          {creating
            ? 'Wird erstellt…'
            : selected.size > 0
              ? `Bundle anlegen (${selected.size} ${selected.size === 1 ? 'Artikel' : 'Artikel'})`
              : 'Bundle anlegen'}
        </Button>
      </ActionBar>
    </div>
  );
}
