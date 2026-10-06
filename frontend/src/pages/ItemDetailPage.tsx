import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { ItemDetail, SaleEvent } from '../api/types';
import { ChannelCards } from '../components/ChannelCards';
import { ConfidenceCenter } from '../components/ConfidenceCenter';
import { DispositionPanel } from '../components/DispositionPanel';
import { PhotoCapture } from '../components/PhotoCapture';
import { PhotoGallery } from '../components/PhotoGallery';
import { PhotoQualityPanel } from '../components/PhotoQualityPanel';
import { DetailPageSkeleton } from '../components/Skeleton';
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
    return <DetailPageSkeleton />;
  }

  const { item } = detail;

  return (
    <div className="max-w-md mx-auto">
      <div className="p-4 flex items-center justify-between">
        <Link to="/" className="text-xs text-ink-faint hover:text-ink-muted">
          ← Dashboard
        </Link>
        <div className="flex items-center gap-3">
          {(item.status === 'NEW' ||
            item.status === 'ANALYZING' ||
            item.status === 'REVIEW_REQUIRED' ||
            item.status === 'READY') && (
            <DiscardItemAction
              busy={busy}
              onDiscard={() => run(() => itemsApi.discard(id))}
            />
          )}
          <StatusBadge status={item.status} />
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-3 bg-danger-soft border border-danger/20 rounded-xl p-3 text-xs text-danger">
          {error}
        </div>
      )}

      {detail.photos.length > 0 && (
        <div className="px-4 mb-4 space-y-3">
          <PhotoGallery photos={detail.photos} />
          <PhotoQualityPanel itemId={id} photoCount={detail.photos.length} />
        </div>
      )}

      {(item.status === 'NEW' || item.status === 'ANALYZING') && (
        <AnalyzeStep
          itemId={id}
          busy={busy || item.status === 'ANALYZING'}
          onAnalyze={(files, onProgress) => run(() => itemsApi.analyze(id, files, onProgress))}
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
          <div className="px-4 pb-8">
            <Link
              to={`/items/${id}/angebotspaket`}
              className="block w-full p-3 rounded-xl font-bold bg-accent text-accent-ink hover:bg-accent-hover transition-colors text-center"
            >
              Kanal-Karten erstellen
            </Link>
          </div>
        </div>
      )}

      {item.status === 'LISTED' && <ChannelCards itemId={id} onChanged={reload} />}

      {item.status === 'SALE_CONFLICT' && (
        <ConflictResolutionPanel itemId={id} busy={busy} run={run} />
      )}

      {item.status === 'BUNDLED' && (
        <Centered
          title="Teil eines Bundles"
          message="Dieser Artikel ist einem Bundle zugeordnet und gesperrt, solange das Bundle besteht."
          showDashboardLink
        />
      )}

      {item.status === 'SOLD' && (
        <div className="pb-4">
          <ChannelCards itemId={id} onChanged={reload} />
          <p className="px-4 text-xs text-ink-faint">
            Ein Verkauf setzt die anderen Karten auf „bitte zurückziehen“, bis du das bestätigst.
          </p>
        </div>
      )}

      {(item.status === 'CANCELLED' || item.status === 'ARCHIVED') && (
        <div className="p-4">
          <Centered
            title={item.title ?? 'Artikel'}
            message={`Status: ${item.status}. Für diesen Zustand sind in der aktuellen Frontend-Version keine weiteren Aktionen vorgesehen.`}
            showDashboardLink
          />
        </div>
      )}
    </div>
  );
}

function DiscardItemAction({
  busy,
  onDiscard,
}: {
  busy: boolean;
  onDiscard: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-danger">Wirklich verwerfen?</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDiscard()}
          className="text-xs font-bold text-danger underline"
        >
          Ja
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(false)}
          className="text-xs font-bold text-ink-muted underline"
        >
          Abbrechen
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-xs text-ink-faint hover:text-danger transition-colors"
    >
      Artikel verwerfen
    </button>
  );
}

function Centered({
  title,
  message,
  showDashboardLink,
}: {
  title: string;
  message: string;
  showDashboardLink?: boolean;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-3">
        <h1 className="text-lg font-bold text-ink">{title}</h1>
        <p className="text-sm text-ink-muted">{message}</p>
        {showDashboardLink && (
          <Link
            to="/"
            className="inline-block text-sm font-bold text-accent hover:text-accent-hover"
          >
            ← Zurück zum Dashboard
          </Link>
        )}
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
  onAnalyze: (files: File[], onProgress?: (fraction: number) => void) => Promise<void>;
}) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);

  const start = async () => {
    setUploadProgress(0);
    setAnalyzing(false);
    await onAnalyze(photos, (fraction) => {
      setUploadProgress(fraction);
      if (fraction >= 0.999) setAnalyzing(true);
    });
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold text-ink">Fotos hinzufügen</h1>
      <PhotoCapture files={photos} onChange={setPhotos} itemId={itemId} />
      {busy && uploadProgress > 0 && !analyzing && (
        <div className="w-full h-1.5 rounded-full bg-line overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-150"
            style={{ width: `${Math.round(uploadProgress * 100)}%` }}
          />
        </div>
      )}
      <button
        type="button"
        disabled={busy || photos.length === 0}
        onClick={start}
        className="w-full p-3 rounded-xl font-bold bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
      >
        {!busy && 'Analysieren'}
        {busy && analyzing && 'KI analysiert die Fotos…'}
        {busy && !analyzing && uploadProgress > 0 && `Fotos werden hochgeladen… ${Math.round(uploadProgress * 100)}%`}
        {busy && !analyzing && uploadProgress === 0 && 'Analysiert…'}
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
      <div className="bg-danger-soft border border-danger/20 rounded-xl p-4">
        <h1 className="text-lg font-bold text-danger">Verkaufskonflikt</h1>
        <p className="text-xs text-danger/90 mt-1">
          Mehrere Plattformen melden einen Verkauf. Wähle den tatsächlichen Verkauf — alle anderen
          Listings werden storniert.
        </p>
      </div>

      {!events && <p className="text-sm text-ink-faint">Lädt…</p>}

      {openEvents.map((event) => (
        <div
          key={event.id}
          className="bg-surface border border-line rounded-xl p-4 flex items-center justify-between"
        >
          <div>
            <p className="font-bold text-ink">{event.reportedPrice.toFixed(2)} €</p>
            <p className="text-xs text-ink-faint">
              Event {event.externalEventId} ·{' '}
              {new Date(event.reportedAt).toLocaleString('de-DE')}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => itemsApi.resolveConflict(itemId, event.id))}
            className="text-xs font-bold px-3 py-2 rounded-lg bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
          >
            Als Sieger wählen
          </button>
        </div>
      ))}

      {events && openEvents.length === 0 && (
        <p className="text-sm text-ink-faint">
          Keine offenen Verkaufsmeldungen (mehr) — dieser Status müsste sich in Kürze automatisch
          auflösen. Falls nicht, lade die Seite neu.
        </p>
      )}
    </div>
  );
}
