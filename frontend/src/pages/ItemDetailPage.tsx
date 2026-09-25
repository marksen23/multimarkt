import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { ItemDetail, ListingChannel, SaleEvent } from '../api/types';
import { ConfidenceCenter } from '../components/ConfidenceCenter';
import { DispositionPanel } from '../components/DispositionPanel';
import { ListingsManager } from '../components/ListingsManager';
import { PhotoCapture } from '../components/PhotoCapture';
import { PhotoGallery } from '../components/PhotoGallery';
import { PhotoQualityPanel } from '../components/PhotoQualityPanel';
import { PriceResearchPanel } from '../components/PriceResearchPanel';
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
          <PrepareListingStep
            itemId={id}
            currentTitle={item.title}
            busy={busy}
            onUpdateTitle={(title) => run(() => itemsApi.updateTitle(id, title))}
            onPrepare={(price, description) =>
              run(() => itemsApi.prepareListing(id, price, description))
            }
          />
        </div>
      )}

      {item.status === 'LISTED' && (
        <div className="p-4 space-y-4">
          <h1 className="text-lg font-bold text-ink">Listings</h1>
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
          showDashboardLink
        />
      )}

      {(item.status === 'SOLD' || item.status === 'CANCELLED' || item.status === 'ARCHIVED') && (
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

function PrepareListingStep({
  itemId,
  currentTitle,
  busy,
  onUpdateTitle,
  onPrepare,
}: {
  itemId: string;
  currentTitle: string | null;
  busy: boolean;
  onUpdateTitle: (title: string) => Promise<void>;
  onPrepare: (price: number, description?: string) => Promise<void>;
}) {
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [salesGoal, setSalesGoal] = useState('BALANCED');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const generateDescription = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await itemsApi.generateDescription(itemId, salesGoal);
      setDescription(result.descriptionText);
    } catch {
      setGenerateError('Vorschlag konnte nicht erzeugt werden.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold text-ink">Verkaufspreis festlegen</h1>
      <TitleEditor itemId={itemId} currentTitle={currentTitle} busy={busy} onUpdateTitle={onUpdateTitle} />
      <PriceResearchPanel itemId={itemId} onSuggestPrice={(p) => setPrice(String(p))} />
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        placeholder="Preis in €"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="w-full p-3 border border-line rounded-xl text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition"
      />
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-ink-muted uppercase tracking-wide shrink-0">Beschreibung</span>
          <div className="flex items-center gap-2">
            <select
              value={salesGoal}
              onChange={(e) => setSalesGoal(e.target.value)}
              className="text-[11px] border border-line rounded-lg px-1.5 py-1 bg-surface text-ink-muted outline-none focus:border-accent"
            >
              <option value="BALANCED">Ausgewogen</option>
              <option value="FAST_SALE">Schnell verkaufen</option>
              <option value="MAX_PROFIT">Maximaler Erlös</option>
              <option value="MINIMAL_EFFORT">Minimaler Aufwand</option>
            </select>
            <button
              type="button"
              onClick={generateDescription}
              disabled={generating}
              className="text-[11px] font-bold text-ink-muted hover:text-accent disabled:opacity-60 transition-colors shrink-0"
            >
              {generating ? 'Generiert…' : '✨ Vorschlag generieren'}
            </button>
          </div>
        </div>
        <textarea
          rows={3}
          placeholder="Beschreibung (optional — leer lassen für eine einfache Standardvorlage)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full p-3 border border-line rounded-xl text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition"
        />
        {generateError && <p className="text-xs text-danger">{generateError}</p>}
      </div>
      <button
        type="button"
        disabled={busy || !price}
        onClick={() => onPrepare(Number(price), description || undefined)}
        className="w-full p-3 rounded-xl font-bold bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
      >
        {busy ? 'Wird angelegt…' : 'Listing anlegen'}
      </button>
    </div>
  );
}

function TitleEditor({
  itemId,
  currentTitle,
  busy,
  onUpdateTitle,
}: {
  itemId: string;
  currentTitle: string | null;
  busy: boolean;
  onUpdateTitle: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(currentTitle ?? '');
  const [channel, setChannel] = useState<ListingChannel>('KLEINANZEIGEN');
  const [missingTokens, setMissingTokens] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const saveTitle = async () => {
    await onUpdateTitle(title);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const generateTitle = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await itemsApi.generateTitle(itemId, channel);
      setTitle(result.title);
      setMissingTokens(result.gapAnalysis.missingTokens);
    } catch {
      setGenerateError('Vorschlag konnte nicht erzeugt werden.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-ink-muted uppercase tracking-wide shrink-0">Titel</span>
        <div className="flex items-center gap-2">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as ListingChannel)}
            className="text-[11px] border border-line rounded-lg px-1.5 py-1 bg-surface text-ink-muted outline-none focus:border-accent"
          >
            <option value="KLEINANZEIGEN">Kleinanzeigen</option>
            <option value="EBAY">eBay</option>
            <option value="VINTED">Vinted</option>
          </select>
          <button
            type="button"
            onClick={generateTitle}
            disabled={generating}
            className="text-[11px] font-bold text-ink-muted hover:text-accent disabled:opacity-60 transition-colors shrink-0"
          >
            {generating ? 'Generiert…' : '✨ Vorschlag generieren'}
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Titel"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 p-3 border border-line rounded-xl text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition"
        />
        <button
          type="button"
          disabled={busy || !title || title === currentTitle}
          onClick={saveTitle}
          className="px-3 rounded-xl text-xs font-bold bg-surface border border-line text-ink-muted hover:text-accent disabled:opacity-50 transition-colors"
        >
          {saved ? '✓ Gespeichert' : 'Speichern'}
        </button>
      </div>
      {generateError && <p className="text-xs text-danger">{generateError}</p>}
      {missingTokens.length > 0 && (
        <p className="text-xs text-ink-faint">
          Vergleichsangebote nutzen zusätzlich: {missingTokens.slice(0, 6).join(', ')}
        </p>
      )}
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
