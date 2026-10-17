import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { bundlesApi } from '../api/bundles';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { BundleDetail, Item, ItemListEntry } from '../api/types';
import { ListingsManager } from '../components/ListingsManager';
import { DetailPageSkeleton } from '../components/Skeleton';
import { Button, Card, EmptyState, Icon, Notice, PageHeader, PhaseBadge, SectionLabel, Spinner, inputClass } from '../ui';

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
    <div className="bg-surface border border-accent/30 rounded-card shadow-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-micro uppercase text-ink-muted">Bereite Artikel hinzufügen</p>
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
            className="text-label text-accent hover:text-accent-hover transition-colors"
          >
            {selected.size === readyItems.length ? 'Keine' : 'Alle'}
          </button>
        )}
      </div>
      {readyItems === null && (
        <div className="flex items-center gap-2 text-label font-normal text-ink-faint">
          <Spinner />
          Artikel werden geladen…
        </div>
      )}
      {readyItems?.length === 0 && (
        <p className="text-label font-normal text-ink-faint">
          Noch keine bereiten Artikel vorhanden. Artikel zuerst analysieren und bestätigen.
        </p>
      )}
      <div className="space-y-1">
        {readyItems?.map(({ item }) => (
          <label
            key={item.id}
            className={`flex items-center gap-3 bg-surface border rounded-control px-3 py-2.5 text-body text-ink cursor-pointer transition ${
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
              {item.condition && <p className="text-label font-normal text-ink-faint">{item.condition}</p>}
            </div>
          </label>
        ))}
      </div>
      {(readyItems?.length ?? 0) > 0 && (
        <Button
          block
          size="md"
          disabled={busy || selected.size === 0}
          onClick={add}
        >
          {busy
            ? 'Wird hinzugefügt…'
            : selected.size > 0
              ? `${selected.size} ${selected.size === 1 ? 'Artikel' : 'Artikel'} hinzufügen → Bundle bereit`
              : 'Artikel auswählen'}
        </Button>
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
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [detail, setDetail] = useState<BundleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const priceValue = price ?? searchParams.get('preis') ?? '';
  const descriptionValue = description ?? detail?.bundle.description ?? '';

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
      return (
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
          <Notice tone="danger">{error}</Notice>
        </div>
      );
    }
    return <DetailPageSkeleton />;
  }

  const { bundle, items, listings } = detail;

  const prepareListing = () =>
    run(() => bundlesApi.prepareListing(id, Number(priceValue), descriptionValue));

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-4">
      <Link to="/bundles" className="inline-block text-label font-normal text-ink-faint hover:text-ink-muted">
        ← Bundles
      </Link>

      <PageHeader
        title={bundle.title}
        subtitle={bundle.description}
        action={<PhaseBadge status={bundle.status} className="mt-1" />}
      />

      {error && <Notice tone="danger">{error}</Notice>}

      <section>
        <SectionLabel>Enthaltene Artikel ({items.length})</SectionLabel>
        {items.length === 0 && bundle.status !== 'NEW' ? (
          <EmptyState icon="package" title="Noch keine Artikel in diesem Bundle." />
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => (
              <Link
                key={item.id}
                to={`/items/${item.id}`}
                className="flex items-center justify-between gap-3 bg-surface border border-line rounded-control px-3 py-2 hover:border-accent/40 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-body text-ink font-medium truncate">
                    {item.title ?? `Artikel ${item.id.slice(0, 8)}`}
                  </p>
                  {item.condition && (
                    <p className="text-label font-normal text-ink-faint">{item.condition}</p>
                  )}
                </div>
                <PhaseBadge status={item.status} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {bundle.status === 'NEW' && id && (
        <AddItemsSection bundleId={id} busy={busy} run={run} />
      )}

      {listings.length > 0 && (
        <section>
          <SectionLabel>Listings</SectionLabel>
          <ListingsManager
            listings={listings}
            busy={busy}
            run={run}
            emptyLabel="Noch kein Canonical Listing vorhanden."
          />
        </section>
      )}

      {bundle.status === 'READY' && listings.length === 0 && (
        <Card className="p-4 space-y-3">
          <p className="text-micro uppercase text-ink-muted">Listing anlegen</p>

          {/* Description with suggestion button */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-label text-ink-muted">Beschreibung</label>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDescription(buildBundleDescription(items))}
                  className="inline-flex items-center gap-1 text-label text-accent hover:text-accent-hover transition-colors"
                >
                  <Icon name="sparkle" size={14} />
                  Vorschlag generieren
                </button>
              )}
            </div>
            <textarea
              rows={5}
              placeholder="Beschreibung des Bundles…"
              value={descriptionValue}
              onChange={(e) => setDescription(e.target.value)}
              className={`${inputClass} resize-none`}
            />
            <div className="flex items-center justify-between px-0.5">
              <div className="flex-1 h-0.5 rounded-full bg-line overflow-hidden mr-3">
                <div
                  className={`h-full rounded-full transition-all ${descriptionValue.length > 1500 ? 'bg-danger' : 'bg-accent'}`}
                  style={{ width: `${Math.min((descriptionValue.length / 1500) * 100, 100)}%` }}
                />
              </div>
              <span className={`text-label tabular-nums shrink-0 ${descriptionValue.length > 1500 ? 'text-danger' : 'font-normal text-ink-faint'}`}>
                {descriptionValue.length} / 1500
              </span>
            </div>
          </div>

          {/* Price */}
          <div className="space-y-1.5">
            <label className="text-label text-ink-muted">Preis (€)</label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="z. B. 29.99"
              value={priceValue}
              onChange={(e) => setPrice(e.target.value)}
              className={inputClass}
            />
          </div>

          <Button
            block
            size="md"
            loading={busy}
            disabled={busy || !priceValue || !descriptionValue || descriptionValue.length > 1500}
            onClick={prepareListing}
          >
            Listing anlegen
          </Button>
        </Card>
      )}
    </div>
  );
}
