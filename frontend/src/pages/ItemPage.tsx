import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { ItemDetail } from '../api/types';
import { ConfidenceCenter } from '../components/ConfidenceCenter';

export function ItemPage() {
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

  if (error) {
    return <StatusScreen title="Fehler" message={error} />;
  }
  if (!detail) {
    return <StatusScreen title="Lädt…" message="Artikel wird geladen." />;
  }

  const { item } = detail;

  if (item.status === 'NEW' || item.status === 'ANALYZING') {
    return (
      <AnalyzeStep
        busy={busy || item.status === 'ANALYZING'}
        onAnalyze={async (imageUrls) => {
          if (!id) return;
          setBusy(true);
          setError(null);
          try {
            await itemsApi.analyze(id, imageUrls);
            await reload();
          } catch (e) {
            setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  if (item.status === 'REVIEW_REQUIRED') {
    return (
      <ConfidenceCenter
        detail={detail}
        saving={busy}
        onConfirmCondition={async (condition) => {
          if (!id) return;
          setBusy(true);
          setError(null);
          try {
            await itemsApi.confirmTruth(id, condition);
            await reload();
          } catch (e) {
            setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  if (item.status === 'READY') {
    return (
      <PrepareListingStep
        busy={busy}
        onPrepare={async (price, description) => {
          if (!id) return;
          setBusy(true);
          setError(null);
          try {
            await itemsApi.prepareListing(id, price, description);
            await reload();
          } catch (e) {
            setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  return (
    <StatusScreen
      title={`Status: ${item.status}`}
      message="Dieser Zustand wird in der aktuellen Frontend-Version nur angezeigt, nicht weiter bearbeitet."
    />
  );
}

function StatusScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-2">
        <h1 className="text-lg font-bold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500">{message}</p>
      </div>
    </div>
  );
}

function AnalyzeStep({
  busy,
  onAnalyze,
}: {
  busy: boolean;
  onAnalyze: (imageUrls: string[]) => Promise<void>;
}) {
  const [urlsText, setUrlsText] = useState('');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
        <h1 className="text-lg font-bold text-gray-900">Fotos hinzufügen</h1>
        <p className="text-xs text-gray-500">
          Noch kein echter Upload angebunden (kein S3-Adapter in diesem
          Projektstand) — bis dahin: Bild-URLs, eine pro Zeile.
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
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
          onClick={async () => {
            await onPrepare(Number(price), description || undefined);
          }}
          className="w-full p-3 rounded-lg font-bold bg-black text-white disabled:bg-gray-300"
        >
          {busy ? 'Wird angelegt…' : 'Listing anlegen'}
        </button>
      </div>
    </div>
  );
}
