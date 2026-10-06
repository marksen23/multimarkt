import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
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
  const navigate = useNavigate();
  const toast = useToast();
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [schnellmodus, setSchnellmodus] = useState(false);

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

  useEffect(() => {
    if (schnellmodus && detail?.item.status === 'READY' && id) {
      navigate(`/items/${id}/angebotspaket`);
    }
  }, [schnellmodus, detail?.item.status, navigate, id]);

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

      <ItemStepper status={item.status} />

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
          onAnalyzeStart={() => setSchnellmodus(true)}
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
          <div className="px-4">
            <button
              type="button"
              onClick={() => navigate(`/items/${id}/angebotspaket`)}
              className="w-full p-3 rounded-xl font-bold bg-accent text-accent-ink hover:bg-accent-hover transition-colors"
            >
              ✨ Angebotspaket erstellen
            </button>
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
        <FinishedScreen detail={detail} />
      )}
    </div>
  );
}

type StepState = 'done' | 'current' | 'todo';

const STEPS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'foto', label: 'Foto', statuses: [] },
  { key: 'analyse', label: 'Analyse', statuses: ['NEW', 'ANALYZING'] },
  { key: 'pruefung', label: 'Prüfung', statuses: ['REVIEW_REQUIRED'] },
  { key: 'bereit', label: 'Bereit', statuses: ['READY'] },
  { key: 'listing', label: 'Listing', statuses: ['LISTED', 'SALE_CONFLICT'] },
  { key: 'verkauft', label: 'Fertig', statuses: ['SOLD', 'CANCELLED', 'ARCHIVED'] },
];

function stepState(stepIndex: number, currentStatus: string): StepState {
  const currentStepIndex = STEPS.findIndex((s) => s.statuses.includes(currentStatus));
  if (currentStepIndex === -1) return stepIndex === 0 ? 'done' : 'todo';
  if (stepIndex < currentStepIndex) return 'done';
  if (stepIndex === currentStepIndex) return 'current';
  return 'todo';
}

function ItemStepper({ status }: { status: string }) {
  const hiddenStatuses = ['BUNDLED', 'SOLD', 'CANCELLED', 'ARCHIVED'];
  if (hiddenStatuses.includes(status)) return null;

  return (
    <div className="px-4 pb-3">
      <div className="flex items-center">
        {STEPS.map((step, i) => {
          const state = stepState(i, status);
          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-0.5">
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    state === 'done'
                      ? 'bg-accent'
                      : state === 'current'
                      ? 'bg-accent animate-pulse'
                      : 'bg-line'
                  }`}
                />
                <span
                  className={`text-[9px] font-bold uppercase tracking-wide whitespace-nowrap ${
                    state === 'done' || state === 'current' ? 'text-accent' : 'text-ink-faint'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mx-1 mb-3 ${state === 'done' ? 'bg-accent/40' : 'bg-line'}`}
                />
              )}
            </div>
          );
        })}
      </div>
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
  onAnalyzeStart,
  onAnalyze,
}: {
  itemId: string;
  busy: boolean;
  onAnalyzeStart: () => void;
  onAnalyze: (files: File[], onProgress?: (fraction: number) => void) => Promise<void>;
}) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);

  const start = async () => {
    onAnalyzeStart();
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
  const [marketMedian, setMarketMedian] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [salesGoal, setSalesGoal] = useState('BALANCED');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [descriptionMissingTokens, setDescriptionMissingTokens] = useState<string[]>([]);
  const [vaguePhrases, setVaguePhrases] = useState<{ phrase: string; suggestion: string }[]>([]);

  const generateDescription = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await itemsApi.generateDescription(itemId, salesGoal);
      setDescription(result.descriptionText);
      setDescriptionMissingTokens(result.gapAnalysis.missingTokens);
      setVaguePhrases(result.vaguePhrases);
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
      <PriceResearchPanel
        itemId={itemId}
        onSuggestPrice={(p) => setPrice(String(p))}
        onMedianAvailable={(m) => setMarketMedian(m)}
      />
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
      <PriceHint enteredPrice={Number(price)} marketMedian={marketMedian} />
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
        {descriptionMissingTokens.length > 0 && (
          <p className="text-xs text-ink-faint">
            Vergleichsangebote nutzen zusätzlich: {descriptionMissingTokens.slice(0, 6).join(', ')}
          </p>
        )}
        {vaguePhrases.length > 0 && (
          <div className="text-xs text-ink-faint space-y-0.5">
            {vaguePhrases.map((v, i) => (
              <p key={i}>
                ⚠️ „{v.phrase}“ ist vage — {v.suggestion}
              </p>
            ))}
          </div>
        )}
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

function PriceHint({ enteredPrice, marketMedian }: { enteredPrice: number; marketMedian: number | null }) {
  if (!marketMedian || !enteredPrice || isNaN(enteredPrice) || enteredPrice <= 0) return null;
  const ratio = enteredPrice / marketMedian;
  const pct = Math.round((ratio - 1) * 100);

  let label: string;
  let cls: string;
  if (ratio < 0.8) {
    label = `${pct} % unter Marktmedian (${marketMedian.toFixed(0)} €) — sehr günstig`;
    cls = 'text-accent';
  } else if (ratio <= 1.1) {
    label = `${pct >= 0 ? '+' : ''}${pct} % zum Marktmedian (${marketMedian.toFixed(0)} €) — fairer Preis`;
    cls = 'text-ink-muted';
  } else {
    label = `+${pct} % über Marktmedian (${marketMedian.toFixed(0)} €) — eher hoch`;
    cls = 'text-amber-600 dark:text-amber-400';
  }

  return <p className={`text-[11px] ${cls}`}>{label}</p>;
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

function FinishedScreen({ detail }: { detail: ItemDetail }) {
  const { item, photos, listings } = detail;
  const navigate = useNavigate();
  const [saleEvents, setSaleEvents] = useState<SaleEvent[] | null>(null);

  useEffect(() => {
    if (item.status === 'SOLD') {
      itemsApi.saleEvents(item.id).then(setSaleEvents).catch(() => setSaleEvents([]));
    }
  }, [item.id, item.status]);

  const thumbnail = photos[0]?.url ?? null;
  const soldListing = listings[0] ?? null;
  const winnerEvent = saleEvents?.find((e) => e.isWinner === true) ?? null;
  const soldPrice = winnerEvent?.reportedPrice ?? soldListing?.sellingPrice ?? null;

  const statusConfig = {
    SOLD: { icon: '✓', label: 'Verkauft', bg: 'bg-accent-soft border-accent/20', text: 'text-accent' },
    CANCELLED: { icon: '✕', label: 'Abgebrochen', bg: 'bg-surface border-line', text: 'text-ink-muted' },
    ARCHIVED: { icon: '◻', label: 'Archiviert', bg: 'bg-surface border-line', text: 'text-ink-muted' },
  } as const;

  const cfg = statusConfig[item.status as 'SOLD' | 'CANCELLED' | 'ARCHIVED'];

  const soldAt = winnerEvent?.reportedAt ?? item.updatedAt;

  return (
    <div className="p-4 space-y-4">
      {/* Status banner */}
      <div className={`flex items-center gap-3 rounded-2xl border p-4 ${cfg.bg}`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${cfg.text} bg-white/40 dark:bg-black/20`}>
          {cfg.icon}
        </div>
        <div>
          <p className={`font-bold text-sm ${cfg.text}`}>{cfg.label}</p>
          <p className="text-xs text-ink-faint">
            {new Date(soldAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {soldPrice !== null && item.status === 'SOLD' && (
          <div className="ml-auto text-right">
            <p className="text-[11px] text-ink-faint">Erlös</p>
            <p className={`text-xl font-extrabold ${cfg.text}`}>{soldPrice.toFixed(2)} €</p>
          </div>
        )}
      </div>

      {/* Item summary */}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        {thumbnail && (
          <img src={thumbnail} alt="" className="w-full h-40 object-cover" />
        )}
        <div className="p-4 space-y-1">
          <p className="font-bold text-ink">{item.title ?? `Artikel ${item.id.slice(0, 8)}`}</p>
          {item.condition && <p className="text-xs text-ink-muted">{item.condition}</p>}
          {soldListing && (
            <p className="text-xs text-ink-faint">Listingpreis: {soldListing.sellingPrice.toFixed(2)} €</p>
          )}
        </div>
      </div>

      {/* CTAs */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => navigate('/new')}
          className="w-full p-3 rounded-xl font-bold bg-accent text-accent-ink hover:bg-accent-hover transition-colors"
        >
          + Nächsten Artikel anlegen
        </button>
        <Link
          to="/"
          className="block w-full p-3 rounded-xl font-bold border border-line text-ink-muted text-center hover:bg-surface-hover transition-colors"
        >
          ← Dashboard
        </Link>
      </div>
    </div>
  );
}
