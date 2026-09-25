import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { ItemDetail, SaleEvent } from '../api/types';
import { ConfidenceCenter } from '../components/ConfidenceCenter';
import { DispositionPanel } from '../components/DispositionPanel';
import { ListingsManager } from '../components/ListingsManager';
import { PhotoCapture } from '../components/PhotoCapture';
import { PhotoGallery } from '../components/PhotoGallery';
import { PriceResearchPanel } from '../components/PriceResearchPanel';
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

      {detail.photos.length > 0 && (
        <div className="px-4 mb-4">
          <PhotoGallery photos={detail.photos} />
        </div>
      )}

      {(item.status === 'NEW' || item.status === 'ANALYZING') && (
        <AnalyzeStep
          itemId={id}
          busy={busy || item.status === 'ANALYZING'}
          onAnalyze={(files) => run(() => itemsApi.analyze(id, files))}
        />
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
            itemId={id}
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

function AnalyzeStep({
  itemId,
  busy,
  onAnalyze,
}: {
  itemId: string;
  busy: boolean;
  onAnalyze: (files: File[]) => Promise<void>;
}) {
  const [photos, setPhotos] = useState<File[]>([]);
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold text-gray-900">Fotos hinzufügen</h1>
      <PhotoCapture files={photos} onChange={setPhotos} itemId={itemId} />
      <button
        type="button"
        disabled={busy || photos.length === 0}
        onClick={() => onAnalyze(photos)}
        className="w-full p-3 rounded-lg font-bold bg-black text-white disabled:bg-gray-300"
      >
        {busy ? 'Analysiert…' : 'Analysieren'}
      </button>
    </div>
  );
}

function PrepareListingStep({
  itemId,
  busy,
  onPrepare,
}: {
  itemId: string;
  busy: boolean;
  onPrepare: (price: number, description?: string) => Promise<void>;
}) {
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const generateDescription = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await itemsApi.generateDescription(itemId);
      setDescription(result.descriptionText);
    } catch {
      setGenerateError('Vorschlag konnte nicht erzeugt werden.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold text-gray-900">Verkaufspreis festlegen</h1>
      <PriceResearchPanel itemId={itemId} onSuggestPrice={(p) => setPrice(String(p))} />
      <input
        type="number"
        min="0"
        step="0.01"
        placeholder="Preis in €"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="w-full p-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-black"
      />
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Beschreibung</span>
          <button
            type="button"
            onClick={generateDescription}
            disabled={generating}
            className="text-[11px] font-bold text-gray-500 hover:text-black disabled:opacity-60"
          >
            {generating ? 'Generiert…' : '✨ Vorschlag generieren'}
          </button>
        </div>
        <textarea
          rows={3}
          placeholder="Beschreibung (optional — leer lassen für eine einfache Standardvorlage)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full p-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-black"
        />
        {generateError && <p className="text-xs text-red-600">{generateError}</p>}
      </div>
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
