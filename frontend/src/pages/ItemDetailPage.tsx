import { useCallback, useEffect, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { followUpsApi, type ItemFollowUp } from '../api/follow-ups';
import { itemsApi } from '../api/items';
import { listingsApi } from '../api/listings';
import { ApiRequestError } from '../api/client';
import type { ItemDetail, ListingChannel, SaleEvent } from '../api/types';
import { buildPhotoBriefing } from '../category/photo-briefing';
import { toLogisticsProfile, type LogisticsProfile } from '../logistics/profile';
import { portalLabel } from '../margin/sale-closeout';
import { Angebotspaket } from '../components/Angebotspaket';
import { SmartReviewPanel } from '../components/SmartReviewPanel';
import { DispositionPanel } from '../components/DispositionPanel';
import { FollowUpPanel } from '../components/FollowUpPanel';
import { LogisticsProfileForm } from '../components/LogisticsProfileForm';
import { ListingsManager } from '../components/ListingsManager';
import { SaleCloseoutForm } from '../components/SaleCloseoutForm';
import { SaleResultPanel } from '../components/SaleResultPanel';
import { PhotoCapture } from '../components/PhotoCapture';
import { PhotoGallery } from '../components/PhotoGallery';
import { PhotoQualityPanel } from '../components/PhotoQualityPanel';
import { PriceResearchPanel } from '../components/PriceResearchPanel';
import { PurchasePanel } from '../components/PurchasePanel';
import { DetailPageSkeleton } from '../components/Skeleton';
import { useItems } from '../contexts/ItemsContext';
import { formatEuro } from '../lib/format';
import {
  ActionBar,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  Icon,
  MoreMenu,
  Notice,
  PhaseBadge,
  PhaseStepper,
  SectionLabel,
  Sheet,
  Spinner,
  inputClass,
  type MoreMenuItem,
} from '../ui';

const DISCARDABLE = new Set(['NEW', 'ANALYZING', 'REVIEW_REQUIRED', 'READY']);
const SELLABLE = new Set(['READY', 'LISTED']);
const FINISHED = new Set(['SOLD', 'CANCELLED', 'ARCHIVED']);

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { refresh: refreshItems } = useItems();
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [followUp, setFollowUp] = useState<ItemFollowUp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<'discard' | 'sold' | null>(null);
  const [manual, setManual] = useState(false);
  const [showTexts, setShowTexts] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const next = await itemsApi.get(id);
      setDetail(next);
      if (next.item.status === 'LISTED') {
        setFollowUp(await followUpsApi.forItem(id));
      } else {
        setFollowUp(null);
      }
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const status = detail?.item.status;

  useEffect(() => {
    if (status !== 'ANALYZING') return;
    const interval = setInterval(() => void reload(), 3000);
    return () => clearInterval(interval);
  }, [status, reload]);

  const prevStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevStatus.current === 'ANALYZING' && status && status !== 'ANALYZING') {
      toast('Analyse abgeschlossen', 'success');
    }
    prevStatus.current = status;
  }, [status, toast]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
      refreshItems();
    } catch (e) {
      const msg = e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1);
    else navigate('/');
  };

  if (error && !detail) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-10">
        <EmptyState icon="alert" title="Artikel nicht gefunden" text={error} action={<ButtonLink to="/" variant="secondary">Zu Heute</ButtonLink>} />
      </div>
    );
  }
  if (!detail || !id) return <DetailPageSkeleton />;

  const { item } = detail;
  const briefing = buildPhotoBriefing(
    detail.attributes,
    detail.photos.map((photo) => photo.shot),
  );
  const logistics = toLogisticsProfile(item);
  const categoryValue =
    detail.attributes.find((attribute) => attribute.attributeKey === 'category')?.attributeValue ?? null;

  const menu: MoreMenuItem[] = [];
  if (item.status === 'READY') {
    menu.push({ label: manual ? 'Angebotspaket anzeigen' : 'Manuell inserieren', icon: manual ? 'sparkle' : 'tag', onSelect: () => setManual((m) => !m) });
  }
  if (SELLABLE.has(item.status) && item.status !== 'LISTED') {
    menu.push({ label: 'Als verkauft markieren', icon: 'euro', onSelect: () => setSheet('sold') });
  }
  if (DISCARDABLE.has(item.status)) {
    menu.push({ label: 'Artikel verwerfen', icon: 'trash', danger: true, onSelect: () => setSheet('discard') });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-3 pb-6 space-y-5">
      <div className="flex items-center justify-between -ml-2">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1 h-10 pl-1 pr-3 rounded-full text-body text-ink-muted hover:bg-surface-hover hover:text-ink"
        >
          <Icon name="chevronLeft" size={20} />
          Zurück
        </button>
        <MoreMenu items={menu} />
      </div>

      <header className="space-y-2">
        <h1 className="text-display text-ink break-words">{item.title ?? 'Unbenannter Artikel'}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <PhaseBadge status={item.status} />
          {item.condition && <span className="text-label font-normal text-ink-muted">{item.condition}</span>}
          {detail.listings[0] && <span className="text-label tabular-nums text-ink">{formatEuro(detail.listings[0].sellingPrice)}</span>}
        </div>
      </header>

      <PhaseStepper status={item.status} />

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="mb-4">
        <PurchasePanel
          key={[
            item.purchasePriceEur,
            item.purchasePortal,
            item.purchaseDate,
            item.purchaseCondition,
            item.purchaseUrl,
          ].join('|')}
          item={item}
          busy={busy}
          onSave={(draft) => run(() => itemsApi.updatePurchase(id, draft))}
        />
      </div>

      {(detail.photos.length > 0 || briefing.category) && !FINISHED.has(item.status) && (
        <div className="space-y-3">
          <PhotoGallery
            photos={detail.photos}
            requiredShots={briefing.requiredShots}
            missingShots={briefing.missingShots}
            busy={busy}
            onShotChange={(photoId, shot) => run(() => itemsApi.assignPhotoShot(id, photoId, shot))}
            onAdd={(file, shot) => run(() => itemsApi.addPhoto(id, file, shot))}
          />
          {DISCARDABLE.has(item.status) && (
            <PhotoQualityPanel itemId={id} photoCount={detail.photos.length} briefing={briefing} />
          )}
        </div>
      )}

      {(item.status === 'NEW' || item.status === 'ANALYZING') && (
        <AnalyzeStep
          itemId={id}
          analyzing={item.status === 'ANALYZING'}
          busy={busy}
          onAnalyze={(files, onProgress) => run(() => itemsApi.analyze(id, files, onProgress))}
        />
      )}

      {item.status === 'REVIEW_REQUIRED' && (
        <SmartReviewPanel
          detail={detail}
          saving={busy}
          onReload={() => void reload()}
          onConfirmCondition={(condition) => run(() => itemsApi.confirmTruth(id, condition))}
          onConfirmAttribute={(key, value) => run(() => itemsApi.confirmAttribute(id, key, value))}
        />
      )}

      {item.status === 'READY' && (
        <>
          <LogisticsProfileForm
            key={[
              item.logisticsCaptured,
              item.weightGrams,
              item.lengthCm,
              item.widthCm,
              item.heightCm,
              item.logisticsBulky,
              item.pickupOnly,
              item.shippingPossible,
              item.postalCode,
            ].join('|')}
            item={item}
            busy={busy}
            onSave={(draft) => run(() => itemsApi.updateLogistics(id, draft))}
          />
          {manual ? (
            <PrepareListingStep
              itemId={id}
              purchasePriceEur={item.purchasePriceEur}
              logistics={logistics}
              currentTitle={item.title}
              busy={busy}
              onUpdateTitle={(title) => run(() => itemsApi.updateTitle(id, title))}
              onPrepare={(price, description) => run(() => itemsApi.prepareListing(id, price, description))}
            />
          ) : (
            <>
              <Angebotspaket
                itemId={id}
                onListed={() => {
                  void reload();
                  refreshItems();
                }}
              />
              <DispositionPanel itemId={id} logistics={logistics} itemCategory={categoryValue} />
            </>
          )}
          <NegotiationEntry itemId={id} />
        </>
      )}

      {item.status === 'LISTED' && (
        <div className="space-y-5">
          <NegotiationEntry itemId={id} />
          {followUp && <FollowUpPanel itemId={id} followUp={followUp} busy={busy} onRecord={run} />}
          <section>
            <SectionLabel>Online auf</SectionLabel>
            <ListingsManager
              listings={detail.listings}
              busy={busy}
              run={run}
              reportSold={false}
              purchasePriceEur={item.purchasePriceEur}
              emptyLabel="Noch kein Listing vorhanden."
            />
          </section>
          {detail.listings[0]?.descriptionText && <CopyDescriptionButton text={detail.listings[0].descriptionText} />}
          {showTexts ? (
            <section>
              <SectionLabel>Texte für weitere Portale</SectionLabel>
              <Angebotspaket itemId={id} />
            </section>
          ) : (
            <Button variant="ghost" block icon="sparkle" onClick={() => setShowTexts(true)}>
              Texte für weitere Portale erzeugen
            </Button>
          )}
          <ActionBar>
            <Button size="lg" icon="euro" onClick={() => setSheet('sold')}>
              Verkauft
            </Button>
          </ActionBar>
        </div>
      )}

      {item.status === 'SALE_CONFLICT' && (
        <>
          <NegotiationEntry itemId={id} />
          <ConflictResolutionPanel itemId={id} busy={busy} run={run} onReload={() => void reload()} />
        </>
      )}

      {item.status === 'BUNDLED' && (
        <EmptyState
          icon="package"
          title="Teil eines Bundles"
          text="Der Artikel ist gesperrt, bis das Bundle verkauft oder aufgelöst wird."
          action={<ButtonLink to="/bundles" variant="secondary">Bundles verwalten</ButtonLink>}
        />
      )}

      {FINISHED.has(item.status) && (
        <FinishedScreen
          detail={detail}
          busy={busy}
          onRecordSale={(draft) => run(() => itemsApi.recordSaleCloseout(id, draft))}
        />
      )}

      <Sheet open={sheet === 'discard'} onClose={() => setSheet(null)} title="Artikel verwerfen?">
        <p className="text-body text-ink-muted mb-4">
          Der Artikel wird storniert und verschwindet aus deinen Aufgaben. Das lässt sich nicht rückgängig machen.
        </p>
        <div className="flex gap-2 [&>*]:flex-1">
          <Button variant="secondary" onClick={() => setSheet(null)}>
            Abbrechen
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void run(() => itemsApi.discard(id)).then(() => setSheet(null))}>
            Verwerfen
          </Button>
        </div>
      </Sheet>

      <SoldSheet
        open={sheet === 'sold'}
        onClose={() => setSheet(null)}
        detail={detail}
        busy={busy}
        onConfirm={(fn) => void run(fn).then(() => setSheet(null))}
      />
    </div>
  );
}

/** Meldet den Verkauf über das Online-Listing (mit echtem Preis); ohne verfolgtes Portal nur den Status. */
function NegotiationEntry({ itemId }: { itemId: string }) {
  return (
    <Link
      to={`/items/${itemId}/verhandlung`}
      className="flex items-center gap-3 bg-surface border border-line rounded-card p-4 hover:bg-surface-hover transition-colors"
    >
      <div className="flex-1 min-w-0">
        <span className="text-micro uppercase text-ink-muted">Verhandlung</span>
        <p className="text-body text-ink mt-1">
          Käufernachricht einfügen. Drei Antworten zum Kopieren, nichts wird gesendet.
        </p>
      </div>
      <Icon name="chevronRight" className="shrink-0 text-ink-faint" size={18} />
    </Link>
  );
}

function SoldSheet({
  open,
  onClose,
  detail,
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  detail: ItemDetail;
  busy: boolean;
  onConfirm: (fn: () => Promise<unknown>) => void;
}) {
  const online = detail.listings.flatMap((l) => l.projections.filter((p) => p.status === 'ONLINE').map((p) => ({ p, listing: l })));
  const [projectionId, setProjectionId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProjectionId(online[0]?.p.id ?? null);
    // Nur beim Öffnen vorbelegen, nicht bei jeder Eingabe überschreiben.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selected = online.find(({ p }) => p.id === projectionId) ?? online[0];

  return (
    <Sheet open={open} onClose={onClose} title="Verkauft!">
      <div className="space-y-4">
        {online.length > 0 && selected ? (
          <>
            {online.length === 1 && (
              <p className="text-label font-normal text-ink-muted">
                Verkauft über <span className="font-semibold text-ink">{portalLabel(selected.p.marketplaceId)}</span>
              </p>
            )}
            {online.length > 1 && (
              <Field label="Verkauft über">
                <select value={projectionId ?? ''} onChange={(e) => setProjectionId(e.target.value)} className={inputClass}>
                  {online.map(({ p }) => (
                    <option key={p.id} value={p.id}>
                      {portalLabel(p.marketplaceId)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <SaleCloseoutForm
              key={selected.p.id}
              initialProceeds={selected.listing.sellingPrice}
              initialPortal={portalLabel(selected.p.marketplaceId)}
              purchasePriceEur={detail.item.purchasePriceEur}
              showProfit
              busy={busy}
              submitLabel="Verkauf speichern"
              onSubmit={(draft) => onConfirm(() => listingsApi.markSold(selected.p.id, draft))}
              onCancel={onClose}
            />
          </>
        ) : (
          <>
            <p className="text-body text-ink-muted">
              Der Artikel wird als verkauft abgeschlossen. Da kein Portal verfolgt wird, wird kein Verkaufspreis gespeichert.
            </p>
            <p className="text-label font-normal text-ink-faint">Das lässt sich nicht rückgängig machen.</p>
            <div className="flex gap-2 [&>*]:flex-1">
              <Button variant="secondary" onClick={onClose}>
                Abbrechen
              </Button>
              <Button loading={busy} onClick={() => onConfirm(() => itemsApi.markSold(detail.item.id))}>
                Verkauft
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

function CopyDescriptionButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await copyText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Zwischenablage nicht verfügbar (z. B. ohne HTTPS) — Text bleibt im Listing sichtbar.
    }
  };
  return (
    <Button variant="secondary" block icon={copied ? 'check' : 'copy'} onClick={() => void copy()}>
      {copied ? 'Beschreibung kopiert' : 'Beschreibung kopieren'}
    </Button>
  );
}

function AnalyzeStep({
  itemId,
  analyzing,
  busy,
  onAnalyze,
}: {
  itemId: string;
  analyzing: boolean;
  busy: boolean;
  onAnalyze: (files: File[], onProgress?: (fraction: number) => void) => Promise<void>;
}) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploaded, setUploaded] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!analyzing) return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [analyzing]);

  const start = async () => {
    setUploadProgress(0);
    setUploaded(false);
    await onAnalyze(photos, (fraction) => {
      setUploadProgress(fraction);
      if (fraction >= 0.999) setUploaded(true);
    });
  };

  if (analyzing) {
    return (
      <Card className="p-5 flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-phase-capture-soft text-phase-capture flex items-center justify-center">
          <Spinner />
        </span>
        <div>
          <p className="text-body font-semibold text-ink">KI analysiert die Fotos</p>
          <p className="text-label font-normal text-ink-faint">
            {elapsed > 0 ? `${elapsed} s · ` : 'Dauert meist 15–30 Sekunden. '}Du kannst die Seite verlassen.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <SectionLabel>Fotos hinzufügen</SectionLabel>
      <PhotoCapture files={photos} onChange={setPhotos} itemId={itemId} />
      {busy && uploadProgress > 0 && !uploaded && (
        <div className="h-1.5 rounded-full bg-line overflow-hidden" role="progressbar" aria-valuenow={Math.round(uploadProgress * 100)}>
          <div className="h-full bg-accent transition-all duration-150" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
        </div>
      )}
      <ActionBar>
        <Button size="lg" icon="sparkle" loading={busy} disabled={photos.length === 0} onClick={() => void start()}>
          {busy && uploaded ? 'KI analysiert…' : busy ? `Lädt hoch… ${Math.round(uploadProgress * 100)} %` : 'Analysieren'}
        </Button>
      </ActionBar>
    </section>
  );
}

function PrepareListingStep({
  itemId,
  purchasePriceEur,
  logistics,
  currentTitle,
  busy,
  onUpdateTitle,
  onPrepare,
}: {
  itemId: string;
  purchasePriceEur: number | null;
  logistics: LogisticsProfile;
  currentTitle: string | null;
  busy: boolean;
  onUpdateTitle: (title: string) => Promise<void>;
  onPrepare: (price: number, description?: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(currentTitle ?? '');
  const [price, setPrice] = useState('');
  const [marketMedian, setMarketMedian] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [salesGoal, setSalesGoal] = useState('BALANCED');
  const [generating, setGenerating] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
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

  const autoFill = async () => {
    setAutoFilling(true);
    setGenerateError(null);
    try {
      const [titleResult, descResult, priceResult] = await Promise.all([
        itemsApi.generateTitle(itemId, 'KLEINANZEIGEN'),
        itemsApi.generateDescription(itemId, salesGoal),
        itemsApi.priceResearch(itemId),
      ]);
      setTitle(titleResult.title);
      setDescription(descResult.descriptionText);
      setDescriptionMissingTokens(descResult.gapAnalysis.missingTokens);
      setVaguePhrases(descResult.vaguePhrases);
      if (priceResult.recommendation?.listPrice) setPrice(String(priceResult.recommendation.listPrice));
    } catch {
      setGenerateError('Automatisches Ausfüllen fehlgeschlagen — bitte einzeln versuchen.');
    } finally {
      setAutoFilling(false);
    }
  };

  const anyGenerating = generating || autoFilling;

  return (
    <section className="space-y-4">
      <SectionLabel
        action={
          <Button variant="ghost" size="sm" icon="sparkle" loading={autoFilling} disabled={anyGenerating || busy} onClick={() => void autoFill()}>
            Alles ausfüllen
          </Button>
        }
      >
        Manuell inserieren
      </SectionLabel>
      <TitleEditor itemId={itemId} title={title} onTitleChange={setTitle} savedTitle={currentTitle} busy={busy} onUpdateTitle={onUpdateTitle} />
      <PriceResearchPanel
        itemId={itemId}
        purchasePriceEur={purchasePriceEur}
        logistics={logistics}
        onSuggestPrice={(p) => setPrice(String(p))}
        onMedianAvailable={setMarketMedian}
      />
      <Field label="Preis (€)">
        <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Preis in €" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
      </Field>
      <PriceHint enteredPrice={Number(price)} marketMedian={marketMedian} />
      <Field
        label="Beschreibung"
        count={description.length > 0 ? { value: description.length, max: 1500 } : undefined}
        error={generateError}
        action={
          <div className="flex items-center gap-1">
            <select
              value={salesGoal}
              onChange={(e) => setSalesGoal(e.target.value)}
              className="h-8 px-2 rounded-control border border-line bg-surface text-label text-ink-muted outline-none focus:border-accent"
              aria-label="Verkaufsziel"
            >
              <option value="BALANCED">Ausgewogen</option>
              <option value="FAST_SALE">Schnell verkaufen</option>
              <option value="MAX_PROFIT">Maximaler Erlös</option>
              <option value="MINIMAL_EFFORT">Minimaler Aufwand</option>
            </select>
            <Button variant="ghost" size="sm" icon="sparkle" loading={generating} disabled={anyGenerating} onClick={() => void generateDescription()}>
              Vorschlag
            </Button>
          </div>
        }
      >
        <textarea
          rows={5}
          placeholder="Optional — leer lassen für eine einfache Standardvorlage"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${inputClass} resize-y`}
        />
      </Field>
      {descriptionMissingTokens.length > 0 && (
        <p className="text-label font-normal text-ink-faint">Vergleichsangebote nennen zusätzlich: {descriptionMissingTokens.slice(0, 6).join(', ')}</p>
      )}
      {vaguePhrases.length > 0 && (
        <Notice tone="warning">
          {vaguePhrases.map((v, i) => (
            <p key={i}>
              „{v.phrase}“ ist vage — {v.suggestion}
            </p>
          ))}
        </Notice>
      )}
      <ActionBar>
        <Button size="lg" icon="check" loading={busy} disabled={!price} onClick={() => void onPrepare(Number(price), description || undefined)}>
          Listing anlegen
        </Button>
      </ActionBar>
    </section>
  );
}

function PriceHint({ enteredPrice, marketMedian }: { enteredPrice: number; marketMedian: number | null }) {
  if (!marketMedian || !enteredPrice || isNaN(enteredPrice) || enteredPrice <= 0) return null;
  const ratio = enteredPrice / marketMedian;
  const pct = Math.round((ratio - 1) * 100);
  const median = `${marketMedian.toFixed(0)} €`;
  if (ratio < 0.8) return <p className="text-label font-normal text-accent">{pct} % unter Marktmedian ({median}) — sehr günstig</p>;
  if (ratio <= 1.1)
    return (
      <p className="text-label font-normal text-ink-muted">
        {pct >= 0 ? '+' : ''}
        {pct} % zum Marktmedian ({median}) — fairer Preis
      </p>
    );
  return <p className="text-label font-normal text-warning">+{pct} % über Marktmedian ({median}) — eher hoch</p>;
}

function TitleEditor({
  itemId,
  title,
  onTitleChange,
  savedTitle,
  busy,
  onUpdateTitle,
}: {
  itemId: string;
  title: string;
  onTitleChange: (t: string) => void;
  savedTitle: string | null;
  busy: boolean;
  onUpdateTitle: (title: string) => Promise<void>;
}) {
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
      onTitleChange(result.title);
      setMissingTokens(result.gapAnalysis.missingTokens);
    } catch {
      setGenerateError('Vorschlag konnte nicht erzeugt werden.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Field
        label="Titel"
        error={generateError}
        action={
          <div className="flex items-center gap-1">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as ListingChannel)}
              className="h-8 px-2 rounded-control border border-line bg-surface text-label text-ink-muted outline-none focus:border-accent"
              aria-label="Portal für den Titel"
            >
              <option value="KLEINANZEIGEN">Kleinanzeigen</option>
              <option value="EBAY">eBay</option>
              <option value="VINTED">Vinted</option>
            </select>
            <Button variant="ghost" size="sm" icon="sparkle" loading={generating} onClick={() => void generateTitle()}>
              Vorschlag
            </Button>
          </div>
        }
      >
        <input type="text" placeholder="Titel" value={title} onChange={(e) => onTitleChange(e.target.value)} className={inputClass} />
      </Field>
      <div className="flex items-center justify-between gap-2">
        {missingTokens.length > 0 ? (
          <p className="text-label font-normal text-ink-faint">Vergleichsangebote nennen zusätzlich: {missingTokens.slice(0, 6).join(', ')}</p>
        ) : (
          <span />
        )}
        <Button variant="secondary" size="sm" icon={saved ? 'check' : undefined} disabled={busy || !title || title === savedTitle} onClick={() => void saveTitle()}>
          {saved ? 'Gespeichert' : 'Titel speichern'}
        </Button>
      </div>
    </div>
  );
}

function ConflictResolutionPanel({
  itemId,
  busy,
  run,
  onReload,
}: {
  itemId: string;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  onReload: () => void;
}) {
  const [events, setEvents] = useState<SaleEvent[] | null>(null);

  useEffect(() => {
    itemsApi.saleEvents(itemId).then(setEvents);
  }, [itemId]);

  const openEvents = events?.filter((e) => e.isWinner === null) ?? [];

  return (
    <section className="space-y-3">
      <Notice tone="danger">
        <p className="font-semibold">Mehrere Portale melden einen Verkauf.</p>
        <p>Wähle den tatsächlichen Verkauf, alle anderen Listings werden storniert.</p>
      </Notice>

      {!events && (
        <p className="flex items-center gap-2 text-body text-ink-faint">
          <Spinner /> Verkaufsmeldungen werden geladen…
        </p>
      )}

      {openEvents.map((event) => (
        <Card key={event.id} className="p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-title tabular-nums text-ink">{formatEuro(event.reportedPrice)}</p>
            <p className="text-label font-normal text-ink-faint">
              Meldung {event.externalEventId} · {new Date(event.reportedAt).toLocaleString('de-DE')}
            </p>
          </div>
          <Button size="sm" disabled={busy} onClick={() => void run(() => itemsApi.resolveConflict(itemId, event.id))}>
            Auswählen
          </Button>
        </Card>
      ))}

      {events && openEvents.length === 0 && (
        <EmptyState
          icon="refresh"
          title="Keine offenen Meldungen"
          text="Der Status sollte sich gleich automatisch auflösen."
          action={
            <Button variant="secondary" size="sm" icon="refresh" onClick={onReload}>
              Neu laden
            </Button>
          }
        />
      )}
    </section>
  );
}

function FinishedScreen({
  detail,
  busy,
  onRecordSale,
}: {
  detail: ItemDetail;
  busy: boolean;
  onRecordSale: (draft: Parameters<typeof itemsApi.recordSaleCloseout>[1]) => Promise<void>;
}) {
  const { item, photos, listings } = detail;
  const [saleEvents, setSaleEvents] = useState<SaleEvent[] | null>(null);

  useEffect(() => {
    if (item.status === 'SOLD') {
      itemsApi.saleEvents(item.id).then(setSaleEvents).catch(() => setSaleEvents([]));
    }
  }, [item.id, item.status]);

  const sold = item.status === 'SOLD';
  const thumbnail = photos[0]?.url ?? null;
  const listing = listings[0] ?? null;
  const winner = saleEvents?.find((e) => e.isWinner === true) ?? null;
  const soldPrice = winner?.reportedPrice ?? listing?.sellingPrice ?? null;
  const date = new Date(winner?.reportedAt ?? item.updatedAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {thumbnail && <img src={thumbnail} alt="" className="w-full h-44 object-cover" />}
        <div className="p-5 flex items-center gap-4">
          <span
            className={`w-12 h-12 rounded-full flex items-center justify-center ${sold ? 'bg-phase-done text-phase-done-ink' : 'bg-phase-archive-soft text-phase-archive'}`}
          >
            <Icon name={sold ? 'check' : 'x'} size={22} strokeWidth={2.6} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-title text-ink">{sold ? 'Verkauft' : item.status === 'ARCHIVED' ? 'Archiviert' : 'Storniert'}</p>
            <p className="text-label font-normal text-ink-faint">{date}</p>
          </div>
          {sold && soldPrice !== null && (
            <div className="text-right">
              <p className="text-label font-normal text-ink-faint">Erlös</p>
              <p className="text-display text-accent tabular-nums">{formatEuro(soldPrice)}</p>
            </div>
          )}
        </div>
      </Card>
      {sold && <SaleResultPanel item={item} busy={busy} onRecord={onRecordSale} />}
      <ActionBar>
        <ButtonLink to="/new" size="lg" icon="camera">
          Nächsten Artikel erfassen
        </ButtonLink>
      </ActionBar>
    </div>
  );
}
