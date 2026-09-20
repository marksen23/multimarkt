import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { ItemDetail, SaleEvent } from '../api/types';
import { ConfidenceCenter } from '../components/ConfidenceCenter';
import { DispositionPanel } from '../components/DispositionPanel';
import { ListingsManager } from '../components/ListingsManager';
import { StatusBadge } from '../components/StatusBadge';

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      setDetail(await itemsApi.get(id));
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
      setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  };

  if (error && !detail) {
    return <Centered title="Fehler" message={error} />;
  }
  if (!detail || !id) {
    return <Centered title="Lädt…" message="Artikel wird geladen." />;
  }

  const { item } = detail;

  return (
    <div className="max-w-md mx-auto">
      <div className="p-4 flex items-center justify-between">
        <Link to="/" className="text-xs text-gray-400 hover:text-gray-600">
          ← Dashboard
        </Link>
        <StatusBadge status={item.status} />
      </div>

      {error && (
        <div className="mx-4 mb-3 bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {(item.status === 'NEW' || item.status === 'ANALYZING') && (
        <AnalyzeStep busy={busy || item.status === 'ANALYZING'} onAnalyze={(urls) => run(() => itemsApi.analyze(id, urls))} />
      )}

      {item.status === 'REVIEW_REQUIRED' && (
        <ConfidenceCenter
          detail={detail}
          saving={busy}
          onConfirmCondition={(condition) => run(() => itemsApi.confirmTruth(id, condition))}
          onConfirmAttribute={(key, value) => run(() => itemsApi.confirmAttribute(id, key, value))}
        />
      )}

      {item.status === 'READY' && (
        <div className="space-y-4">
          <div className="px-4 pt-4">
            <DispositionPanel itemId={id} />
          </div>
          <PrepareListingStep
            busy={busy}
            onPrepare={(price, description) =>
              run(() => itemsApi.prepareListing(id, price, description))
            }
          />
        </div>
      )}

      {item.status === 'LISTED' && (
        <div className="p-4 space-y-4">
          <h1 className="text-lg font-bold text-gray-900">Listings</h1>
          <ListingsManager
            listings={detail.listings}
            busy={busy}
            run={run}
            emptyLabel="Noch kein Canonical Listing vorhanden."
          />
        </div>
      )}

      {item.status === 'SALE_CONFLICT' && (
        <ConflictResolutionPanel itemId={id} busy={busy} run={run} />
      )}

      {item.status === 'BUNDLED' && (
        <Centered
          title="Teil eines Bundles"
          message="Dieser Artikel ist einem Bundle zugeordnet und gesperrt, solange das Bundle besteht."
        />
      )}

      {(item.status === 'SOLD' || item.status === 'CANCELLED' || item.status === 'ARCHIVED') && (
        <div className="p-4">
          <Centered
            title={item.title ?? 'Artikel'}
            message={`Status: ${item.status}. Für diesen Zustand sind in der aktuellen Frontend-Version keine weiteren Aktionen vorgesehen.`}
          />
        </div>
      )}
    </div>
  );
}

function Centered({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-2">
        <h1 className="text-lg font-bold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500">{message}</p>
      </div>
    </div>
  );
}

function AnalyzeStep({ busy, onAnalyze }: { busy: boolean; onAnalyze: (imageUrls: string[]) => Promise<void> }) {
  const [urlsText, setUrlsText] = useState('');
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold text-gray-900">Fotos hinzufügen</h1>
      <p className="text-xs text-gray-500">
        Noch kein echter Upload angebunden (kein S3-Adapter in diesem Projektstand) — bis dahin:
        Bild-URLs, eine pro Zeile.
      </p>
      <textarea
        rows={4}
        value={urlsText}
        onChange={(e) => setUrlsText(e.target.value)}
        placeholder={'https://example.com/foto1.jpg\nhttps://example.com/foto2.jpg'}
        className="w-full p-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-black"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          onAnalyze(
            urlsText
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean),
          )
        }
        className="w-full p-3 rounded-lg font-bold bg-black text-white disabled:bg-gray-300"
      >
        {busy ? 'Analysiert…' : 'Analysieren'}
      </button>
    </div>
  );
}

function PrepareListingStep({
  busy,
  onPrepare,
}: {
  busy: boolean;
  onPrepare: (price: number, description?: string) => Promise<void>;
}) {
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold text-gray-900">Verkaufspreis festlegen</h1>
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
        placeholder="Beschreibung (optional — sonst automatisch generiert)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full p-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-black"
      />
      <button
        type="button"
        disabled={busy || !price}
        onClick={() => onPrepare(Number(price), description || undefined)}
        className="w-full p-3 rounded-lg font-bold bg-black text-white disabled:bg-gray-300"
      >
        {busy ? 'Wird angelegt…' : 'Listing anlegen'}
      </button>
    </div>
  );
}

function ConflictResolutionPanel({
  itemId,
  busy,
  run,
}: {
  itemId: string;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [events, setEvents] = useState<SaleEvent[] | null>(null);

  useEffect(() => {
    itemsApi.saleEvents(itemId).then(setEvents);
  }, [itemId]);

  const openEvents = events?.filter((e) => e.isWinner === null) ?? [];

  return (
    <div className="p-4 space-y-4">
      <div className="bg-red-50 border border-red-100 rounded-xl p-4">
        <h1 className="text-lg font-bold text-red-800">Verkaufskonflikt</h1>
        <p className="text-xs text-red-700 mt-1">
          Mehrere Plattformen melden einen Verkauf. Wähle den tatsächlichen Verkauf — alle anderen
          Listings werden storniert.
        </p>
      </div>

      {!events && <p className="text-sm text-gray-400">Lädt…</p>}

      {openEvents.map((event) => (
        <div
          key={event.id}
          className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between"
        >
          <div>
            <p className="font-bold text-gray-900">{event.reportedPrice.toFixed(2)} €</p>
            <p className="text-xs text-gray-400">
              Event {event.externalEventId} ·{' '}
              {new Date(event.reportedAt).toLocaleString('de-DE')}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => itemsApi.resolveConflict(itemId, event.id))}
            className="text-xs font-bold px-3 py-2 rounded-lg bg-black text-white disabled:bg-gray-300"
          >
            Als Sieger wählen
          </button>
        </div>
      ))}
    </div>
  );
}
