import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { copyText } from '../lib/clipboard';
import { itemsApi } from '../api/items';
import { listingsApi } from '../api/listings';
import { ApiRequestError } from '../api/client';
import type {
  ChannelCard,
  ChannelPackage,
  DescriptionChannel,
  DescriptionQualityResult,
  EstimatedTimeToSale,
  IssueSeverity,
  ListingChannel,
  MarketplaceProjectionSummary,
  MarketplaceRecommendation,
  PriceDescriptionAlignment,
  PriceTier,
  ProjectionLifecycleState,
  SalesGoal,
  SecondhandMarketplace,
} from '../api/types';
import { shippingPortalsAllowed, toLogisticsProfile } from '../logistics/profile';
import { useToast } from './Toast';
import { ActionBar, Button, Card, Field, Icon, Notice, PhaseBadge, SectionLabel, Sheet, Spinner, inputClass } from '../ui';

const SHIPPING_PORTALS = new Set<SecondhandMarketplace>(['EBAY', 'VINTED']);

/**
 * Portale mit gespeicherter Kanal-Karte (Titel, Text, Preis und Status je
 * Portal). Das Backend speichert immer alle drei zusammen.
 */
const CARD_MARKETS: ListingChannel[] = ['KLEINANZEIGEN', 'VINTED', 'EBAY'];
const isCardMarket = (m: SecondhandMarketplace): m is ListingChannel => (CARD_MARKETS as string[]).includes(m);

/** Texte einer Karte lassen sich nur bis „kopiert“ ändern, danach steht die Anzeige. */
const EDITABLE_CARD_STATES = new Set<ProjectionLifecycleState>(['DRAFT', 'COPIED']);

interface CardState {
  id: string;
  status: ProjectionLifecycleState;
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiRequestError) return e.body.message;
  return e instanceof Error && e.message ? e.message : fallback;
}

interface PortalTextConfig {
  titleChannel: ListingChannel;
  descChannel: DescriptionChannel;
  titleMax: number;
}

const TEXT_CONFIGS: Partial<Record<SecondhandMarketplace, PortalTextConfig>> = {
  KLEINANZEIGEN: { titleChannel: 'KLEINANZEIGEN', descChannel: 'KLEINANZEIGEN', titleMax: 65 },
  EBAY: { titleChannel: 'EBAY', descChannel: 'EBAY', titleMax: 80 },
  VINTED: { titleChannel: 'VINTED', descChannel: 'VINTED', titleMax: 80 },
  MARKT_DE: { titleChannel: 'KLEINANZEIGEN', descChannel: 'GENERIC', titleMax: 80 },
  QUOKA: { titleChannel: 'KLEINANZEIGEN', descChannel: 'GENERIC', titleMax: 80 },
  FACEBOOK: { titleChannel: 'KLEINANZEIGEN', descChannel: 'GENERIC', titleMax: 100 },
};

const GOALS: { value: SalesGoal; label: string }[] = [
  { value: 'BALANCED', label: 'Ausgewogen' },
  { value: 'FAST_SALE', label: 'Schnell verkaufen' },
  { value: 'MAX_PROFIT', label: 'Maximaler Erlös' },
  { value: 'MINIMAL_EFFORT', label: 'Minimaler Aufwand' },
];

const DESCRIPTION_MAX = 1500;

type TextLoadState = 'loading' | 'loaded' | 'error';

interface PortalDraft {
  loadState: TextLoadState;
  title: string;
  description: string;
  quality: DescriptionQualityResult | null;
  priceAlignment: PriceDescriptionAlignment | null;
  /** Eigener Preis der Karte; null folgt dem Startpreis. */
  price: string | null;
  /** Abweichend vom gespeicherten Stand der Kanal-Karte. */
  dirty: boolean;
}

const emptyDraft = (loadState: TextLoadState): PortalDraft => ({
  loadState,
  title: '',
  description: '',
  quality: null,
  priceAlignment: null,
  price: null,
  dirty: false,
});

function draftFromCard(card: ChannelCard): PortalDraft {
  return {
    ...emptyDraft('loaded'),
    title: card.title,
    description: card.descriptionText,
    price: card.suggestedPrice === null ? null : card.suggestedPrice.toFixed(2),
  };
}

function cardStates(pack: ChannelPackage): Partial<Record<ListingChannel, CardState>> {
  const states: Partial<Record<ListingChannel, CardState>> = {};
  for (const card of pack.cards) {
    if (card.id && card.status) states[card.marketplaceId] = { id: card.id, status: card.status };
  }
  return states;
}

type CopyState = 'idle' | 'copied' | 'error';

function useCopy() {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = async (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    try {
      await copyText(text);
      setState('copied');
    } catch {
      setState('error');
    }
    timer.current = setTimeout(() => setState('idle'), 1800);
  };
  return { state, copy };
}

function parsePrice(v: string): number | null {
  const n = parseFloat(v.replace(',', '.'));
  return isNaN(n) || n <= 0 ? null : n;
}

/**
 * Schritt „Inserieren“: Preis, Portal-Empfehlung und fertige Texte je Portal.
 * Mit `onListed` (Status READY) gibt es die Primäraktion „Inseriert“, die
 * das Listing anlegt; ohne (Status LISTED) dient es nur zum erneuten Kopieren.
 *
 * Kleinanzeigen, Vinted und eBay sind Kanal-Karten: Titel, Text und Preis
 * werden gespeichert und beim nächsten Öffnen wieder geladen statt neu
 * erzeugt. Je Karte gibt es die Schritte „Kopiert“ und „Online bestätigt“.
 * Die erste gespeicherte Karte legt bei einem bereiten Artikel das Listing an.
 * `projections` hält Status-Änderungen aus „Online auf“ synchron, `onChanged`
 * meldet eigene Änderungen an die Seite.
 */
export function Angebotspaket({
  itemId,
  onListed,
  onChanged,
  projections,
}: {
  itemId: string;
  onListed?: () => void;
  onChanged?: () => void;
  projections?: MarketplaceProjectionSummary[];
}) {
  const toast = useToast();
  const [salesGoal, setSalesGoal] = useState<SalesGoal>('BALANCED');
  const [loadingRecs, setLoadingRecs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const priceCopy = useCopy();
  const [recommendations, setRecommendations] = useState<MarketplaceRecommendation[]>([]);
  const [detectedCategory, setDetectedCategory] = useState('');
  const [drafts, setDrafts] = useState<Partial<Record<SecondhandMarketplace, PortalDraft>>>({});
  const draftsRef = useRef(drafts);
  const [cards, setCards] = useState<Partial<Record<ListingChannel, CardState>>>({});
  const [hasListing, setHasListing] = useState(false);
  const [cardBusy, setCardBusy] = useState<ListingChannel | 'SAVE' | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [listingPrice, setListingPrice] = useState('');
  const [listingBusy, setListingBusy] = useState(false);
  const [portal, setPortal] = useState<'KLEINANZEIGEN' | 'OTHER'>('KLEINANZEIGEN');
  const [pickupOnlyNote, setPickupOnlyNote] = useState(false);
  const [fix, setFix] = useState<{ projectionId: string; missing: string[] } | null>(null);
  const [fixValues, setFixValues] = useState<Record<string, string>>({});

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  // Status-Änderungen aus „Online auf“ (z. B. Online bestätigt, Storno) übernehmen.
  useEffect(() => {
    if (!projections) return;
    setCards((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const market of CARD_MARKETS) {
        const card = prev[market];
        const projection = card && projections.find((p) => p.id === card.id);
        if (card && projection && projection.status !== card.status) {
          next[market] = { ...card, status: projection.status };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [projections]);

  const fetchPortalText = useCallback(
    async (marketplace: SecondhandMarketplace, goal: SalesGoal): Promise<PortalDraft> => {
      const cfg = TEXT_CONFIGS[marketplace]!;
      const [titleResult, descResult] = await Promise.all([
        itemsApi.generateTitle(itemId, cfg.titleChannel),
        itemsApi.generateDescription(itemId, goal, cfg.descChannel),
      ]);
      return {
        loadState: 'loaded',
        title: titleResult.title,
        description: descResult.descriptionText,
        quality: descResult.quality,
        priceAlignment: descResult.priceAlignment,
        price: null,
        dirty: true,
      };
    },
    [itemId],
  );

  const loadPortalText = useCallback(
    async (marketplace: SecondhandMarketplace, goal: SalesGoal) => {
      if (!TEXT_CONFIGS[marketplace]) return;
      setDrafts((prev) => ({ ...prev, [marketplace]: emptyDraft('loading') }));
      try {
        const draft = await fetchPortalText(marketplace, goal);
        setDrafts((prev) => ({ ...prev, [marketplace]: draft }));
      } catch {
        setDrafts((prev) => ({ ...prev, [marketplace]: emptyDraft('error') }));
      }
    },
    [fetchPortalText],
  );

  /**
   * `initial`: gespeicherte Kanal-Karten übernehmen. Sonst (Ziel geändert,
   * „Neu erzeugen“) werden alle Texte neu erzeugt, außer bei Karten, die
   * schon kopiert oder online sind — deren Text steht bereits im Portal.
   */
  const generate = useCallback(
    async (goal: SalesGoal, initial: boolean) => {
      setLoadingRecs(true);
      setError(null);
      try {
        const [detail, recResult, priceResult] = await Promise.all([
          itemsApi.get(itemId),
          itemsApi.marketplaceRecommendations(itemId, goal),
          itemsApi.priceResearch(itemId, false, goal),
        ]);
        // Nur nachladen, wenn es Kanal-Projektionen gibt — sonst würde der
        // Endpoint eine frische Vorschau mit drei Texten erzeugen.
        const hasCardProjections = detail.listings.some((l) =>
          l.projections.some((p) => (CARD_MARKETS as string[]).includes(p.marketplaceId)),
        );
        const pack = hasCardProjections ? await itemsApi.channelPackage(itemId) : null;

        const profile = toLogisticsProfile(detail.item);
        const hideShipping = profile.captured && !shippingPortalsAllowed(profile);
        setPickupOnlyNote(hideShipping);
        const visible = hideShipping
          ? recResult.recommendations.filter((rec) => !SHIPPING_PORTALS.has(rec.marketplace))
          : recResult.recommendations;
        setRecommendations(visible);
        setDetectedCategory(recResult.detectedCategory);
        setHasListing(detail.listings.length > 0);
        setCards(pack ? cardStates(pack) : {});

        const rec = priceResult.recommendation;
        if (rec?.startPriceRecommended) setPrice(rec.listPrice.toFixed(2));
        else if (!rec) {
          const medians = priceResult.sources.map((s) => s.median).filter((m): m is number => m !== null);
          if (medians.length) setPrice(Math.round(medians.reduce((a, b) => a + b, 0) / medians.length).toFixed(2));
        }

        const previous = draftsRef.current;
        const kept: Partial<Record<SecondhandMarketplace, PortalDraft>> = {};
        for (const card of pack?.cards ?? []) {
          if (!card.id || !card.status) continue;
          // Ältere Kleinanzeigen-Projektionen haben keinen eigenen Text.
          if (!card.title && !card.descriptionText) continue;
          if (initial) kept[card.marketplaceId] = draftFromCard(card);
          else if (card.status !== 'DRAFT') {
            const prev = previous[card.marketplaceId];
            kept[card.marketplaceId] = prev?.loadState === 'loaded' ? prev : draftFromCard(card);
          }
        }
        setDrafts(kept);
        setLoadingRecs(false);

        const toLoad = new Set<SecondhandMarketplace>(
          visible
            .filter((r) => r.marketplace in TEXT_CONFIGS)
            .slice(0, 2)
            .map((r) => r.marketplace),
        );
        if (!initial) for (const m of Object.keys(previous) as SecondhandMarketplace[]) toLoad.add(m);
        for (const m of Object.keys(kept)) toLoad.delete(m as SecondhandMarketplace);
        await Promise.all([...toLoad].map((m) => loadPortalText(m, goal)));
      } catch {
        setError('Generierung fehlgeschlagen. Bitte erneut versuchen.');
        setLoadingRecs(false);
      }
    },
    [itemId, loadPortalText],
  );

  useEffect(() => {
    void generate('BALANCED', true);
  }, [generate]);

  const updateDraft = (marketplace: SecondhandMarketplace, field: 'title' | 'description' | 'price', value: string) => {
    setDrafts((prev) => {
      const existing = prev[marketplace];
      return existing ? { ...prev, [marketplace]: { ...existing, [field]: value, dirty: true } } : prev;
    });
  };

  const cardEditable = (market: ListingChannel) => {
    const status = cards[market]?.status;
    return !status || EDITABLE_CARD_STATES.has(status);
  };
  const cardPrice = (draft: PortalDraft | undefined) => draft?.price ?? price;
  const unsavedCards = CARD_MARKETS.some((m) => drafts[m]?.dirty && drafts[m]?.loadState === 'loaded' && cardEditable(m));
  const cardsLoading = CARD_MARKETS.some((m) => drafts[m]?.loadState === 'loading');

  /**
   * Speichert alle drei Kanal-Karten. Fehlt einer Karte noch der Text (nicht
   * geöffnet oder bei Abholware ausgeblendet), wird er vorher erzeugt — das
   * Backend nimmt das Paket nur vollständig an.
   */
  const savePackage = async (): Promise<ChannelPackage> => {
    const complete = { ...drafts };
    await Promise.all(
      CARD_MARKETS.filter((m) => complete[m]?.loadState !== 'loaded').map(async (m) => {
        complete[m] = await fetchPortalText(m, salesGoal);
      }),
    );
    const payload = CARD_MARKETS.map((m) => {
      const draft = complete[m]!;
      return {
        marketplaceId: m,
        title: draft.title.trim(),
        descriptionText: draft.description.trim(),
        suggestedPrice: parsePrice(cardPrice(draft)),
      };
    });
    if (payload.some((card) => !card.title || !card.descriptionText || card.suggestedPrice === null)) {
      throw new Error('Jede Karte braucht Titel, Text und einen Preis.');
    }
    const pack = await itemsApi.saveChannelPackage(
      itemId,
      payload.map((card) => ({ ...card, suggestedPrice: card.suggestedPrice! })),
    );
    setCards(cardStates(pack));
    setHasListing(true);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const card of pack.cards) {
        const base = prev[card.marketplaceId] ?? complete[card.marketplaceId]!;
        // Gesperrte Karten (online, verkauft …) ändert das Backend nicht — dort gilt der gespeicherte Text.
        const editable = !card.status || EDITABLE_CARD_STATES.has(card.status);
        next[card.marketplaceId] =
          editable || !card.title ? { ...base, price: cardPrice(complete[card.marketplaceId]), dirty: false } : { ...base, ...draftFromCard(card) };
      }
      return next;
    });
    return pack;
  };

  const runCardAction = async (key: ListingChannel | 'SAVE', fn: () => Promise<string>) => {
    setCardBusy(key);
    try {
      const message = await fn();
      toast(message, 'success');
      onChanged?.();
    } catch (e) {
      toast(errorMessage(e, 'Das hat nicht geklappt.'), 'error');
    } finally {
      setCardBusy(null);
    }
  };

  const ensureSavedCard = async (market: ListingChannel): Promise<string> => {
    let id = cards[market]?.id;
    if (!id || unsavedCards) {
      const pack = await savePackage();
      id = pack.cards.find((card) => card.marketplaceId === market)?.id ?? undefined;
    }
    if (!id) throw new Error('Kanal-Karte konnte nicht gespeichert werden.');
    return id;
  };

  const setCardStatus = (market: ListingChannel, projection: MarketplaceProjectionSummary) =>
    setCards((prev) => ({ ...prev, [market]: { id: projection.id, status: projection.status } }));

  const markCopied = (market: ListingChannel) =>
    runCardAction(market, async () => {
      const id = await ensureSavedCard(market);
      setCardStatus(market, await listingsApi.markCopied(id));
      return 'Als kopiert markiert. Nach dem Einstellen „Online bestätigen“.';
    });

  const confirmOnline = (market: ListingChannel) =>
    runCardAction(market, async () => {
      const id = await ensureSavedCard(market);
      setCardStatus(market, await listingsApi.confirmOnline(id));
      return 'Als online bestätigt';
    });

  const confirmPublished = (market: ListingChannel) =>
    runCardAction(market, async () => {
      setCardStatus(market, await listingsApi.confirmPublished(cards[market]!.id));
      return 'Als online bestätigt';
    });

  const confirmCancellation = (market: ListingChannel) =>
    runCardAction(market, async () => {
      setCardStatus(market, await listingsApi.confirmCancellation(cards[market]!.id));
      return 'Zurückziehen bestätigt';
    });

  const saveCards = () =>
    runCardAction('SAVE', async () => {
      await savePackage();
      return 'Texte gespeichert';
    });

  const worstAlignment =
    Object.values(drafts)
      .map((d) => d?.priceAlignment)
      .filter((a): a is PriceDescriptionAlignment => a != null)
      .sort((a, b) => a.alignmentScore - b.alignmentScore)[0] ?? null;

  const textMarkets = recommendations.filter((r) => drafts[r.marketplace]);
  const firstDescription = textMarkets.map((r) => drafts[r.marketplace]).find((d) => d?.loadState === 'loaded')?.description;

  // Kleinanzeigen hat keine API: der Nutzer bestätigt hier selbst, dass die
  // Anzeige online ist — das ist genau der Human-Gate-Schritt confirm-published.
  // Fehlen Pflichtangaben der Kategorie (Capability-Check), werden sie im Sheet
  // nachgefragt und derselbe Eintrag danach erneut veröffentlicht.
  const publishKleinanzeigen = async (projectionId: string): Promise<boolean> => {
    try {
      await listingsApi.publish(projectionId);
      await listingsApi.confirmPublished(projectionId);
      return true;
    } catch (e) {
      const missing = e instanceof ApiRequestError && e.body.error_code === 'ERR_CAPABILITY_CHECK_FAILED' ? e.body.details.missing : null;
      if (Array.isArray(missing) && missing.length > 0) {
        setFix({ projectionId, missing: missing as string[] });
        setFixValues({});
      } else {
        setFix(null);
        setSheetOpen(false);
        toast('Listing angelegt — Kleinanzeigen-Status bitte unter „Online auf“ bestätigen.', 'error');
        onListed?.();
      }
      return false;
    }
  };

  const finishListed = () => {
    setFix(null);
    setSheetOpen(false);
    toast('Als inseriert markiert', 'success');
    onListed?.();
  };

  const createListing = async () => {
    const parsed = parsePrice(listingPrice);
    if (parsed === null) return;
    setListingBusy(true);
    let listingId: string;
    try {
      listingId = (await itemsApi.prepareListing(itemId, parsed, firstDescription || undefined)).id;
    } catch {
      toast('Listing konnte nicht angelegt werden.', 'error');
      setListingBusy(false);
      return;
    }
    if (portal === 'KLEINANZEIGEN') {
      let projectionId: string;
      try {
        projectionId = (await listingsApi.create(listingId, 'KLEINANZEIGEN')).id;
      } catch {
        setListingBusy(false);
        setSheetOpen(false);
        toast('Listing angelegt — Kleinanzeigen-Status bitte unter „Online auf“ bestätigen.', 'error');
        onListed?.();
        return;
      }
      const ok = await publishKleinanzeigen(projectionId);
      setListingBusy(false);
      if (ok) finishListed();
      return;
    }
    setListingBusy(false);
    finishListed();
  };

  const completeMissingFacts = async () => {
    if (!fix) return;
    setListingBusy(true);
    try {
      for (const key of fix.missing) {
        await itemsApi.confirmAttribute(itemId, key, fixValues[key]?.trim());
      }
    } catch (e) {
      toast(e instanceof ApiRequestError ? e.body.message : 'Angaben konnten nicht gespeichert werden.', 'error');
      setListingBusy(false);
      return;
    }
    const ok = await publishKleinanzeigen(fix.projectionId);
    setListingBusy(false);
    if (ok) finishListed();
  };

  const closeSheet = () => {
    // Listing existiert bereits (Artikel ist LISTED) — Seite neu laden, damit sie nicht READY zeigt.
    if (fix) {
      setFix(null);
      onListed?.();
    }
    setSheetOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <select
          value={salesGoal}
          disabled={loadingRecs}
          onChange={(e) => {
            const goal = e.target.value as SalesGoal;
            setSalesGoal(goal);
            void generate(goal, false);
          }}
          className={`${inputClass} flex-1`}
          aria-label="Verkaufsziel"
        >
          {GOALS.map((g) => (
            <option key={g.value} value={g.value}>
              Ziel: {g.label}
            </option>
          ))}
        </select>
        <Button variant="secondary" icon="refresh" loading={loadingRecs} onClick={() => void generate(salesGoal, false)} aria-label="Neu erzeugen" />
      </div>

      {error && (
        <Notice tone="danger">
          {error}{' '}
          <button type="button" onClick={() => void generate(salesGoal, true)} className="underline font-semibold">
            Erneut versuchen
          </button>
        </Notice>
      )}

      <section>
        <SectionLabel>Startpreis</SectionLabel>
        <Card className="p-4 space-y-2">
          {loadingRecs && !price ? (
            <SkeletonLine className="h-11 rounded-control" />
          ) : (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={`${inputClass} pr-8 text-title tabular-nums`}
                  aria-label="Startpreis in Euro"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">€</span>
              </div>
              <CopyButton state={priceCopy.state} onClick={() => void priceCopy.copy(price)} />
            </div>
          )}
          {worstAlignment && (
            <p className="text-label font-normal text-ink-faint">
              Preis-Einordnung: <PriceTierLabel tier={worstAlignment.priceTier} />
            </p>
          )}
          {worstAlignment && worstAlignment.alignmentScore < 75 && worstAlignment.issues.length > 0 && (
            <Notice tone="warning">
              {worstAlignment.issues.map((issue, i) => (
                <p key={i}>{issue.message}</p>
              ))}
              {worstAlignment.missingValueSignals.length > 0 && (
                <p className="mt-1">Hilfreich wären: {worstAlignment.missingValueSignals.join(', ')}</p>
              )}
            </Notice>
          )}
        </Card>
      </section>

      <section>
        <SectionLabel action={detectedCategory && !loadingRecs ? <span className="text-label font-normal text-ink-faint">{detectedCategory.split(' > ')[0]}</span> : undefined}>
          Wo verkaufen?
        </SectionLabel>
        {pickupOnlyNote && !loadingRecs && (
          <p className="text-label font-normal text-ink-muted mb-2">
            Versandportale entfallen. Der Artikel ist sperrig oder nur zur Abholung.
          </p>
        )}
        <div className="space-y-2">
          {loadingRecs
            ? [1, 2, 3].map((i) => <SkeletonLine key={i} className="h-16 rounded-card" />)
            : recommendations.map((rec) => (
                <MarketplaceRankRow
                  key={rec.marketplace}
                  rec={rec}
                  draftState={drafts[rec.marketplace]?.loadState}
                  cardStatus={isCardMarket(rec.marketplace) ? cards[rec.marketplace]?.status : undefined}
                  onLoadText={() => void loadPortalText(rec.marketplace, salesGoal)}
                />
              ))}
        </div>
      </section>

      {textMarkets.length > 0 && (
        <section className="space-y-3">
          <SectionLabel
            action={
              hasListing && unsavedCards ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon="check"
                  loading={cardBusy === 'SAVE'}
                  disabled={cardBusy !== null || cardsLoading}
                  onClick={() => void saveCards()}
                >
                  Änderungen speichern
                </Button>
              ) : undefined
            }
          >
            Texte zum Kopieren
          </SectionLabel>
          {textMarkets.map((rec) => {
            const draft = drafts[rec.marketplace]!;
            const cfg = TEXT_CONFIGS[rec.marketplace]!;
            const market = rec.marketplace;
            const channel = isCardMarket(market)
              ? {
                  status: cards[market]?.status ?? null,
                  editable: cardEditable(market),
                  busy: cardBusy === market,
                  disabled: cardBusy !== null || cardsLoading,
                  createsListing: !hasListing,
                  onMarkCopied: () => void markCopied(market),
                  onConfirmOnline: () => void confirmOnline(market),
                  onConfirmPublished: () => void confirmPublished(market),
                  onConfirmCancellation: () => void confirmCancellation(market),
                }
              : null;
            return (
              <PortalCard
                key={market}
                rec={rec}
                cfg={cfg}
                draft={draft}
                price={channel ? cardPrice(draft) : price}
                channel={channel}
                onRetry={() => void loadPortalText(market, salesGoal)}
                onTitleChange={(v) => updateDraft(market, 'title', v)}
                onDescriptionChange={(v) => updateDraft(market, 'description', v)}
                onPriceChange={(v) => updateDraft(market, 'price', v)}
              />
            );
          })}
        </section>
      )}

      {onListed && !loadingRecs && (
        <ActionBar>
          <Button
            size="lg"
            icon="check"
            onClick={() => {
              setListingPrice(price);
              setSheetOpen(true);
            }}
          >
            Inseriert
          </Button>
        </ActionBar>
      )}

      <Sheet open={sheetOpen} onClose={closeSheet} title={fix ? 'Noch kurz ergänzen' : 'Als inseriert markieren'}>
        {fix ? (
          <div className="space-y-4">
            <p className="text-body text-ink-muted">
              Kleinanzeigen braucht für diese Kategorie noch folgende Angaben. Danach wird die Anzeige als online markiert.
            </p>
            {fix.missing.map((key) => (
              <Field key={key} label={FACT_LABELS[key] ?? key}>
                {key === 'functionChecked' || key === 'category' ? (
                  <select
                    value={fixValues[key] ?? ''}
                    onChange={(e) => setFixValues((v) => ({ ...v, [key]: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="">Bitte wählen</option>
                    {(key === 'functionChecked' ? FUNCTION_CHECKED_OPTIONS : CATEGORY_OPTIONS).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={fixValues[key] ?? ''}
                    onChange={(e) => setFixValues((v) => ({ ...v, [key]: e.target.value }))}
                    placeholder={FACT_PLACEHOLDERS[key]}
                    className={inputClass}
                  />
                )}
              </Field>
            ))}
            <Button
              block
              size="lg"
              loading={listingBusy}
              disabled={fix.missing.some((key) => !fixValues[key]?.trim())}
              onClick={() => void completeMissingFacts()}
            >
              Speichern und als online markieren
            </Button>
          </div>
        ) : (
        <div className="space-y-4">
          <p className="text-body text-ink-muted">Wo ist die Anzeige online, und zu welchem Preis?</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Portal">
            {(
              [
                ['KLEINANZEIGEN', 'Kleinanzeigen'],
                ['OTHER', 'Anderes Portal'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={portal === value}
                onClick={() => setPortal(value)}
                className={`h-11 rounded-control border text-body font-semibold transition-colors ${
                  portal === value ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-muted hover:bg-surface-hover'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {portal === 'OTHER' && (
            <p className="text-label font-normal text-ink-faint">
              Andere Portale werden nicht verfolgt. Den Verkauf meldest du später selbst, ohne Verkaufspreis.
            </p>
          )}
          <Field label="Preis in der Anzeige (€)">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              placeholder="z. B. 29.99"
              value={listingPrice}
              onChange={(e) => setListingPrice(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Button block size="lg" loading={listingBusy} disabled={parsePrice(listingPrice) === null} onClick={() => void createListing()}>
            Bestätigen
          </Button>
        </div>
        )}
      </Sheet>
    </div>
  );
}

const FACT_LABELS: Record<string, string> = {
  category: 'Kategorie',
  size: 'Größe',
  brand: 'Marke',
  measurements: 'Maße',
  functionChecked: 'Funktion geprüft?',
};

const FACT_PLACEHOLDERS: Record<string, string> = {
  size: 'z. B. M, 42 oder 98 cm',
  brand: 'z. B. Bosch, Nike',
  measurements: 'z. B. 80 × 40 × 30 cm',
};

const FUNCTION_CHECKED_OPTIONS = [
  { value: 'ja', label: 'Ja, funktioniert' },
  { value: 'nein', label: 'Nein / nicht geprüft' },
];

const CATEGORY_OPTIONS = ['Kleidung', 'Schuhe', 'Elektronik', 'Medien', 'Haushalt', 'Möbel', 'Sonstiges'].map((c) => ({ value: c, label: c }));

const TIME_LABEL: Record<EstimatedTimeToSale, string> = {
  INSTANT: 'Sofort',
  FAST: 'Schnell',
  MEDIUM: 'Mittel',
  SLOW: 'Langsam',
};

function MarketplaceRankRow({
  rec,
  draftState,
  cardStatus,
  onLoadText,
}: {
  rec: MarketplaceRecommendation;
  draftState: TextLoadState | undefined;
  cardStatus: ProjectionLifecycleState | undefined;
  onLoadText: () => void;
}) {
  const isBuyback = rec.type === 'BUYBACK';
  const canLoadText = !isBuyback && rec.marketplace in TEXT_CONFIGS;
  const scoreClass =
    rec.score >= 75
      ? 'bg-accent-soft text-accent'
      : rec.score >= 50
        ? 'bg-warning-soft text-warning'
        : 'bg-surface-hover text-ink-faint';

  return (
    <Card className="px-3 py-3 flex items-start gap-3">
      <span className={`w-10 h-10 rounded-control shrink-0 flex items-center justify-center text-label tabular-nums ${scoreClass}`} title="Eignung (0–100)">
        {rec.score}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
          <span className="text-body font-semibold text-ink">{rec.label}</span>
          {isBuyback && <span className="text-micro uppercase text-ink-faint">Ankauf</span>}
          <span className="text-label font-normal text-ink-faint">{TIME_LABEL[rec.estimatedTimeToSale]}</span>
          {rec.feePercent > 0 && <span className="text-label font-normal text-warning">{rec.feePercent} % Gebühr</span>}
        </div>
        {rec.reasons[0] && <p className="text-label font-normal text-ink-muted mt-0.5">{rec.reasons[0]}</p>}
        {rec.cautions[0] && <p className="text-label font-normal text-warning mt-0.5">{rec.cautions[0]}</p>}
      </div>
      <div className="shrink-0 self-center">
        {isBuyback ? (
          <a href={rec.listingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-label text-ink-muted hover:text-accent">
            Website <Icon name="external" size={13} />
          </a>
        ) : cardStatus && cardStatus !== 'DRAFT' ? (
          <PhaseBadge status={cardStatus} />
        ) : draftState === 'loaded' ? (
          <span className="inline-flex items-center gap-1 text-label text-accent">
            <Icon name="check" size={14} strokeWidth={2.6} /> Text
          </span>
        ) : draftState === 'loading' ? (
          <span className="inline-flex items-center gap-1.5 text-label text-ink-faint"><Spinner />Lädt…</span>
        ) : canLoadText ? (
          <Button variant="ghost" size="sm" onClick={onLoadText}>
            Text erzeugen
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

interface ChannelCardControls {
  status: ProjectionLifecycleState | null;
  editable: boolean;
  busy: boolean;
  disabled: boolean;
  /** Bereiter Artikel ohne Listing: der erste Schritt legt das Listing an. */
  createsListing: boolean;
  onMarkCopied: () => void;
  onConfirmOnline: () => void;
  onConfirmPublished: () => void;
  onConfirmCancellation: () => void;
}

function PortalCard({
  rec,
  cfg,
  draft,
  price,
  channel,
  onRetry,
  onTitleChange,
  onDescriptionChange,
  onPriceChange,
}: {
  rec: MarketplaceRecommendation;
  cfg: PortalTextConfig;
  draft: PortalDraft;
  price: string;
  channel: ChannelCardControls | null;
  onRetry: () => void;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onPriceChange: (v: string) => void;
}) {
  const titleCopy = useCopy();
  const descCopy = useCopy();
  const allCopy = useCopy();
  const [showQuality, setShowQuality] = useState(false);
  const loading = draft.loadState === 'loading';
  const locked = channel !== null && !channel.editable;
  const quality = draft.quality;
  const hasQualityIssues = (quality?.issues.length ?? 0) > 0 || (quality?.attributeCoverage.some((a) => !a.mentioned) ?? false);

  const copyAll = () => {
    const parts = [draft.title];
    if (parsePrice(price) !== null) parts.push(`Preis: ${price} €`);
    parts.push('', draft.description);
    void allCopy.copy(parts.join('\n').trim());
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-body font-semibold text-ink truncate">{rec.label}</span>
          {!loading && quality && <QualityBadge score={quality.score} />}
          {channel?.status && <PhaseBadge status={channel.status} />}
        </div>
        <a
          href={rec.listingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-label text-ink-muted hover:text-accent shrink-0"
        >
          Portal öffnen <Icon name="external" size={13} />
        </a>
      </div>

      {draft.loadState === 'error' ? (
        <div className="p-4">
          <Notice tone="danger">
            Text konnte nicht erzeugt werden.{' '}
            <button type="button" onClick={onRetry} className="underline font-semibold">
              Erneut versuchen
            </button>
          </Notice>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {channel?.status === 'CANCEL_PENDING' && (
            <Notice tone="warning">Auf einem anderen Portal verkauft. Bitte die Anzeige auf {rec.label} zurückziehen und dann bestätigen.</Notice>
          )}

          <Field
            label="Titel"
            count={loading ? undefined : { value: draft.title.length, max: cfg.titleMax }}
            action={<CopyButton state={titleCopy.state} onClick={() => void titleCopy.copy(draft.title)} />}
          >
            {loading ? (
              <SkeletonLine className="h-11 rounded-control" />
            ) : (
              <input type="text" value={draft.title} readOnly={locked} onChange={(e) => onTitleChange(e.target.value)} className={inputClass} />
            )}
          </Field>

          <Field
            label="Beschreibung"
            count={loading ? undefined : { value: draft.description.length, max: DESCRIPTION_MAX }}
            action={<CopyButton state={descCopy.state} onClick={() => void descCopy.copy(draft.description)} />}
          >
            {loading ? (
              <SkeletonLine className="h-28 rounded-control" />
            ) : (
              <textarea
                rows={6}
                value={draft.description}
                readOnly={locked}
                onChange={(e) => onDescriptionChange(e.target.value)}
                className={`${inputClass} resize-y`}
              />
            )}
          </Field>

          {channel && !loading && (
            <Field label="Preis auf diesem Portal (€)" hint={locked ? 'Die Anzeige steht schon, Texte und Preis sind gesperrt.' : undefined}>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={price}
                readOnly={locked}
                onChange={(e) => onPriceChange(e.target.value)}
                className={`${inputClass} tabular-nums`}
              />
            </Field>
          )}

          {!loading && hasQualityIssues && quality && (
            <div>
              <button type="button" onClick={() => setShowQuality((v) => !v)} className="text-label text-ink-muted hover:text-accent" aria-expanded={showQuality}>
                {showQuality ? 'Hinweise ausblenden' : 'Hinweise zur Beschreibung anzeigen'}
              </button>
              {showQuality && (
                <div className="mt-2 space-y-2">
                  {quality.issues.map((issue, i) => (
                    <p key={i} className="flex gap-2 text-label font-normal text-ink-muted">
                      <SeverityDot severity={issue.severity} />
                      {issue.message}
                    </p>
                  ))}
                  {quality.attributeCoverage.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {quality.attributeCoverage.map((a) => (
                        <span
                          key={a.key}
                          className={`text-label font-normal rounded-full px-2 py-0.5 ${a.mentioned ? 'bg-accent-soft text-accent' : 'bg-danger-soft text-danger'}`}
                        >
                          {a.key}: {a.value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!loading && (
            <Button block variant="secondary" icon={allCopy.state === 'copied' ? 'check' : 'copy'} onClick={copyAll}>
              {allCopy.state === 'copied' ? 'Titel, Preis und Text kopiert' : allCopy.state === 'error' ? 'Kopieren fehlgeschlagen' : 'Alles kopieren'}
            </Button>
          )}

          {!loading && channel && <ChannelSteps channel={channel} />}
        </div>
      )}
    </Card>
  );
}

/** Kopiert → Online bestätigt. Status setzt immer der Mensch, kein Portal wird angesprochen. */
function ChannelSteps({ channel }: { channel: ChannelCardControls }) {
  const { status } = channel;
  const copied = status !== null && status !== 'DRAFT' && status !== 'READY' && status !== 'PUBLISHING';
  const online = status === 'ONLINE' || status === 'SOLD';
  if (status === 'CANCELLED') return null;

  let action: ReactNode = null;
  if (status === null || status === 'DRAFT') {
    action = (
      <Button block icon="check" loading={channel.busy} disabled={channel.disabled} onClick={channel.onMarkCopied}>
        Als kopiert markieren
      </Button>
    );
  } else if (status === 'COPIED') {
    action = (
      <Button block icon="check" loading={channel.busy} disabled={channel.disabled} onClick={channel.onConfirmOnline}>
        Online bestätigen
      </Button>
    );
  } else if (status === 'PUBLISHING') {
    action = (
      <Button block icon="check" loading={channel.busy} disabled={channel.disabled} onClick={channel.onConfirmPublished}>
        Ich habe es eingestellt
      </Button>
    );
  } else if (status === 'CANCEL_PENDING') {
    action = (
      <Button block variant="secondary" loading={channel.busy} disabled={channel.disabled} onClick={channel.onConfirmCancellation}>
        Zurückziehen bestätigen
      </Button>
    );
  }

  return (
    <div className="pt-4 border-t border-line space-y-3">
      {status !== 'CANCEL_PENDING' && (
        <ol className="flex items-center gap-2" aria-label="Schritte">
          <StepDot index={1} label="Kopiert" done={copied} active={!copied} />
          <span className={`h-px flex-1 ${copied ? 'bg-accent' : 'bg-line'}`} aria-hidden="true" />
          <StepDot index={2} label="Online bestätigt" done={online} active={copied && !online} />
        </ol>
      )}
      {action}
      {action && (status === null || status === 'DRAFT') && channel.createsListing && (
        <p className="text-label font-normal text-ink-faint">Speichert die Texte für Kleinanzeigen, Vinted und eBay und legt das Listing an.</p>
      )}
    </div>
  );
}

function StepDot({ index, label, done, active }: { index: number; label: string; done: boolean; active: boolean }) {
  return (
    <li className="flex items-center gap-1.5 shrink-0" aria-current={active ? 'step' : undefined}>
      <span
        className={`w-6 h-6 rounded-full flex items-center justify-center text-micro tabular-nums ${
          done ? 'bg-accent text-accent-ink' : active ? 'border border-accent text-accent' : 'border border-line text-ink-faint'
        }`}
      >
        {done ? <Icon name="check" size={13} strokeWidth={3} /> : index}
      </span>
      <span className={`text-label ${done ? 'text-accent' : active ? 'text-ink' : 'text-ink-faint'}`}>{label}</span>
    </li>
  );
}

function PriceTierLabel({ tier }: { tier: PriceTier }) {
  const config: Record<PriceTier, { label: string; className: string }> = {
    BELOW_MARKET: { label: 'unter Markt', className: 'text-accent' },
    MARKET: { label: 'marktüblich', className: 'text-ink-muted' },
    ABOVE_MARKET: { label: 'über Median', className: 'text-warning' },
    PREMIUM: { label: 'Premium', className: 'text-danger' },
  };
  const c = config[tier];
  return <span className={`font-semibold ${c.className}`}>{c.label}</span>;
}

function QualityBadge({ score }: { score: number }) {
  const cls = score >= 80 ? 'bg-accent-soft text-accent' : score >= 55 ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger';
  return (
    <span className={`text-micro rounded-full px-2 h-5 inline-flex items-center tabular-nums ${cls}`} title="Beschreibungsqualität (0–100)">
      Q {score}
    </span>
  );
}

function SeverityDot({ severity }: { severity: IssueSeverity }) {
  const cls = severity === 'ERROR' ? 'bg-danger' : severity === 'WARNING' ? 'bg-warning' : 'bg-ink-faint';
  return <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${cls}`} aria-hidden="true" />;
}

function CopyButton({ state, onClick }: { state: CopyState; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-label transition-colors ${
        state === 'copied' ? 'text-accent' : state === 'error' ? 'text-danger' : 'text-ink-muted hover:text-accent'
      }`}
    >
      <Icon name={state === 'copied' ? 'check' : 'copy'} size={14} />
      {state === 'copied' ? 'Kopiert' : state === 'error' ? 'Fehler' : 'Kopieren'}
    </button>
  );
}

function SkeletonLine({ className }: { className?: string }) {
  return <div className={`bg-line animate-pulse ${className ?? ''}`} />;
}
