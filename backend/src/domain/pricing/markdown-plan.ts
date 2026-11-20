import { daysOnline } from '../listing/follow-up';
import { roundMoney } from './expected-margin';

/**
 * Automatische Preissenkung.
 *
 * Aus, bis der Verkäufer sie im Konto oder am Artikel einschaltet.
 * Der Mindestpreis ist der, den er setzt. Fehlt er, gilt der Mindestpreis
 * aus dem Preisvorschlag. Ohne beides wird nichts gesenkt und nichts erfunden.
 * Unter den Mindestpreis geht der Schritt nie. Verkaufte Artikel stehen still.
 */

export const MARKDOWN_STATUSES = ['INHERIT', 'ACTIVE', 'PAUSED', 'STOPPED'] as const;
export type MarkdownStatus = (typeof MARKDOWN_STATUSES)[number];

export const DEFAULT_MARKDOWN_PERCENT = 10;
export const DEFAULT_MARKDOWN_INTERVAL_DAYS = 7;
export const DEFAULT_ATTENTION_AFTER_DAYS = 21;
export const DEFAULT_MARKDOWN_RETRY_MS = 12 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MarkdownSettings {
  enabled: boolean;
  percent: number;
  intervalDays: number;
  attentionAfterDays: number;
}

export interface MarkdownOverride {
  status: MarkdownStatus;
  percent: number | null;
  intervalDays: number | null;
  floorPrice: number | null;
  lastAppliedAt: Date | null;
  lastAttemptAt: Date | null;
  lastError: string | null;
}

export interface MarkdownProjectionState {
  id: string;
  marketplaceId: string;
  status: string;
  externalPlatformId: string | null;
  publishMeta: Record<string, unknown>;
  onlineSince: Date | null;
}

export interface MarkdownTaskState {
  id: string;
  projectionId: string | null;
  marketplaceId: string;
  targetPrice: number;
  previousPrice: number;
  status: 'OPEN' | 'DONE' | 'DISMISSED' | 'SUPERSEDED';
  kind: 'MANUAL_PRICE' | 'EBAY_ERROR';
  message: string;
  detail: string | null;
  copyText: string;
}

export interface MarkdownItemState {
  userId: string;
  itemId: string;
  itemStatus: string;
  title: string | null;
  settings: MarkdownSettings;
  override: MarkdownOverride | null;
  currentPrice: number | null;
  listingId: string | null;
  onlineSince: Date | null;
  suggestionFloor: number | null;
  projections: MarkdownProjectionState[];
  openTasks: MarkdownTaskState[];
  photoCount: number;
}

export type FloorSource = 'SELLER' | 'SUGGESTION' | 'MISSING';

export interface EffectiveMarkdown {
  status: MarkdownStatus;
  running: boolean;
  paused: boolean;
  stopped: boolean;
  percent: number;
  intervalDays: number;
  floorPrice: number | null;
  floorSource: FloorSource;
  suggestionFloor: number | null;
  currentPrice: number | null;
  nextPrice: number | null;
  reachedFloor: boolean;
  nextDueAt: string | null;
  daysOnline: number | null;
  lastError: string | null;
  waitingForConfirm: boolean;
  summary: string;
}

export type MarkdownSkipReason =
  | 'not_listed'
  | 'stopped'
  | 'paused'
  | 'inactive'
  | 'no_listing'
  | 'no_online'
  | 'waiting_for_confirm'
  | 'no_floor'
  | 'at_floor'
  | 'not_due'
  | 'retry_wait';

export interface EbayPriceUpdate {
  projectionId: string;
  sku: string;
  offerId: string;
}

export interface ManualPriceTask {
  projectionId: string;
  marketplaceId: string;
  message: string;
  detail: string;
  copyText: string;
}

export type MarkdownDecision =
  | { type: 'skip'; reason: MarkdownSkipReason }
  | {
      type: 'drop';
      previousPrice: number;
      nextPrice: number;
      reachedFloor: boolean;
      note: string;
      ebay: EbayPriceUpdate[];
      manual: ManualPriceTask[];
    };

export interface MarkdownRunOptions {
  now: Date;
  retryMs: number;
  ebayApiConfigured: boolean;
}

export type ConfirmPlan =
  | { type: 'reject'; message: string }
  | { type: 'dismiss'; message: string }
  | {
      type: 'complete';
      changePrice: boolean;
      previousPrice: number;
      nextPrice: number;
      message: string;
    };

const euro = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEuroDe(value: number): string {
  return `${euro.format(roundMoney(value))} €`;
}

/** Betrag zum Einfügen ins Preisfeld, mit Komma. */
export function formatPricePaste(value: number): string {
  return euro.format(roundMoney(value));
}

export function priceDropMessage(price: number): string {
  return `Preis auf ${formatEuroDe(price)} senken`;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MARKDOWN_PERCENT;
  return Math.min(90, Math.max(1, Math.round(value * 100) / 100));
}

export function clampIntervalDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MARKDOWN_INTERVAL_DAYS;
  return Math.min(90, Math.max(1, Math.round(value)));
}

export function clampAttentionDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ATTENTION_AFTER_DAYS;
  return Math.min(180, Math.max(7, Math.round(value)));
}

/**
 * Nächster Preis: X % unter dem aktuellen, nie unter dem Mindestpreis.
 * `null`, wenn der aktuelle Preis schon auf oder unter dem Mindestpreis liegt
 * oder der Schritt nichts mehr senkt.
 */
export function nextMarkdownPrice(
  currentPrice: number,
  percent: number,
  floorPrice: number,
): { price: number; reachedFloor: boolean } | null {
  const current = roundMoney(currentPrice);
  const floor = roundMoney(floorPrice);
  if (!(current > 0) || !(floor > 0)) return null;
  if (current <= floor + 0.001) return null;
  const stepped = roundMoney(current * (1 - clampPercent(percent) / 100));
  const price = roundMoney(Math.max(stepped, floor));
  if (price < floor - 0.001) return null;
  if (price > current - 0.009) return null;
  return { price, reachedFloor: price <= floor + 0.001 };
}

export function describeMarkdown(state: MarkdownItemState, now: Date): EffectiveMarkdown {
  const status = state.override?.status ?? 'INHERIT';
  const stopped = status === 'STOPPED';
  const paused = status === 'PAUSED';
  const percent = clampPercent(
    status === 'ACTIVE' && state.override?.percent != null
      ? state.override.percent
      : state.settings.percent,
  );
  const intervalDays = clampIntervalDays(
    status === 'ACTIVE' && state.override?.intervalDays != null
      ? state.override.intervalDays
      : state.settings.intervalDays,
  );
  const sellerFloor =
    state.override?.floorPrice != null && state.override.floorPrice > 0
      ? roundMoney(state.override.floorPrice)
      : null;
  const suggestionFloor =
    state.suggestionFloor != null && state.suggestionFloor > 0
      ? roundMoney(state.suggestionFloor)
      : null;
  const floorPrice = sellerFloor ?? suggestionFloor;
  const floorSource: FloorSource = sellerFloor
    ? 'SELLER'
    : suggestionFloor
      ? 'SUGGESTION'
      : 'MISSING';
  const running = !stopped && !paused && (status === 'ACTIVE' || state.settings.enabled);
  const currentPrice = state.currentPrice != null ? roundMoney(state.currentPrice) : null;
  const step =
    currentPrice != null && floorPrice != null
      ? nextMarkdownPrice(currentPrice, percent, floorPrice)
      : null;
  const reachedFloor =
    currentPrice != null && floorPrice != null && currentPrice <= floorPrice + 0.001;
  const anchor = state.override?.lastAppliedAt ?? state.onlineSince;
  const nextDueAt =
    anchor != null ? new Date(anchor.getTime() + intervalDays * DAY_MS).toISOString() : null;
  const pendingPrice = pendingConfirmPrice(state);
  const waitingForConfirm = pendingPrice != null;
  const lastError = state.override?.lastError ?? null;
  const effective: EffectiveMarkdown = {
    status,
    running,
    paused,
    stopped,
    percent,
    intervalDays,
    floorPrice,
    floorSource,
    suggestionFloor,
    currentPrice,
    nextPrice: step?.price ?? null,
    reachedFloor,
    nextDueAt,
    daysOnline: state.onlineSince ? daysOnline(state.onlineSince, now) : null,
    lastError,
    waitingForConfirm,
    summary: '',
  };
  effective.summary = planSummary(effective, state.settings.enabled, pendingPrice);
  return effective;
}

export function decideMarkdown(
  state: MarkdownItemState,
  options: MarkdownRunOptions,
): MarkdownDecision {
  const effective = describeMarkdown(state, options.now);
  if (state.itemStatus !== 'LISTED') return { type: 'skip', reason: 'not_listed' };
  if (effective.stopped) return { type: 'skip', reason: 'stopped' };
  if (effective.paused) return { type: 'skip', reason: 'paused' };
  if (!effective.running) return { type: 'skip', reason: 'inactive' };
  if (!state.listingId || effective.currentPrice == null) return { type: 'skip', reason: 'no_listing' };
  const online = state.projections.filter((projection) => projection.status === 'ONLINE');
  if (online.length === 0 || !state.onlineSince) return { type: 'skip', reason: 'no_online' };
  if (effective.waitingForConfirm) return { type: 'skip', reason: 'waiting_for_confirm' };
  if (effective.floorPrice == null || effective.nextPrice == null) {
    return { type: 'skip', reason: effective.reachedFloor ? 'at_floor' : 'no_floor' };
  }
  const timing = dropTiming(state, effective.intervalDays, options.now, options.retryMs);
  if (timing !== 'due') return { type: 'skip', reason: timing };

  const ebay: EbayPriceUpdate[] = [];
  const manual: ManualPriceTask[] = [];
  for (const projection of online) {
    const offer = connectedEbayOffer(projection);
    if (projection.marketplaceId === 'EBAY' && offer && options.ebayApiConfigured) {
      ebay.push({ projectionId: projection.id, sku: offer.sku, offerId: offer.offerId });
      continue;
    }
    if (!isManualChannel(projection.marketplaceId) && projection.marketplaceId !== 'EBAY') continue;
    manual.push(manualTask(projection, effective.nextPrice, options.ebayApiConfigured));
  }
  if (ebay.length === 0 && manual.length === 0) return { type: 'skip', reason: 'no_online' };

  return {
    type: 'drop',
    previousPrice: effective.currentPrice,
    nextPrice: effective.nextPrice,
    reachedFloor: effective.nextPrice <= (effective.floorPrice ?? 0) + 0.001,
    note: `Automatisch auf ${formatEuroDe(effective.nextPrice)} gesenkt.`,
    ebay,
    manual,
  };
}

export function planConfirm(input: {
  itemStatus: string;
  currentPrice: number;
  targetPrice: number;
  floorPrice: number | null;
}): ConfirmPlan {
  if (input.itemStatus !== 'LISTED') {
    return {
      type: 'dismiss',
      message: 'Der Artikel ist verkauft oder nicht mehr online. Der Preis bleibt.',
    };
  }
  const current = roundMoney(input.currentPrice);
  const target = roundMoney(input.targetPrice);
  if (!(target > 0)) {
    return { type: 'reject', message: 'Der neue Preis muss größer als 0 € sein.' };
  }
  if (input.floorPrice != null && target < roundMoney(input.floorPrice) - 0.001) {
    return {
      type: 'reject',
      message: `Der Preis ${formatEuroDe(target)} liegt unter dem Mindestpreis ${formatEuroDe(input.floorPrice)}.`,
    };
  }
  if (target > current + 0.001) {
    return {
      type: 'reject',
      message: 'Der neue Preis muss unter dem bisherigen Preis liegen.',
    };
  }
  if (target > current - 0.009) {
    return {
      type: 'complete',
      changePrice: false,
      previousPrice: current,
      nextPrice: current,
      message: `Der Preis steht schon auf ${formatEuroDe(current)}.`,
    };
  }
  return {
    type: 'complete',
    changePrice: true,
    previousPrice: current,
    nextPrice: target,
    message: `Preis auf ${formatEuroDe(target)} gesenkt.`,
  };
}

export interface AttentionSuggestion {
  kind: 'LOWER_PRICE' | 'IMPROVE_PHOTOS' | 'RERUN_ANALYSIS';
  title: string;
  detail: string;
}

export interface AttentionCard {
  itemId: string;
  title: string | null;
  daysOnline: number;
  currentPrice: number;
  suggestions: AttentionSuggestion[];
}

/** Wiedervorlage: online, unverkauft, länger als die gesetzte Frist. */
export function attentionCard(state: MarkdownItemState, now: Date): AttentionCard | null {
  if (state.itemStatus !== 'LISTED' || !state.onlineSince || state.currentPrice == null) return null;
  const days = daysOnline(state.onlineSince, now);
  if (days < clampAttentionDays(state.settings.attentionAfterDays)) return null;
  const effective = describeMarkdown(state, now);
  return {
    itemId: state.itemId,
    title: state.title,
    daysOnline: days,
    currentPrice: roundMoney(state.currentPrice),
    suggestions: [
      lowerPriceSuggestion(state, effective),
      photoSuggestion(state.photoCount),
      {
        kind: 'RERUN_ANALYSIS',
        title: 'Analyse erneut ausführen',
        detail:
          'Rechnet den Preisvergleich neu. Bestätigte Angaben bleiben. Der Mindestpreis kommt daraus, solange du keinen eigenen setzt.',
      },
    ],
  };
}

export function connectedEbayOffer(
  projection: MarkdownProjectionState,
): { sku: string; offerId: string } | null {
  if (projection.marketplaceId !== 'EBAY') return null;
  const external = projection.externalPlatformId?.trim() ?? '';
  if (!external || external.startsWith('ebay-mock-')) return null;
  const offerId = projection.publishMeta?.offerId;
  if (typeof offerId !== 'string' || !offerId.trim()) return null;
  const skuRaw = projection.publishMeta?.sku;
  const sku =
    typeof skuRaw === 'string' && skuRaw.trim()
      ? skuRaw.trim()
      : `r-${projection.id.replace(/-/g, '')}`.slice(0, 50);
  return { sku, offerId: offerId.trim() };
}

export function marketplaceLabel(marketplaceId: string): string {
  if (marketplaceId === 'EBAY') return 'eBay';
  if (marketplaceId === 'KLEINANZEIGEN') return 'Kleinanzeigen';
  if (marketplaceId === 'VINTED') return 'Vinted';
  return marketplaceId;
}

function pendingConfirmPrice(state: MarkdownItemState): number | null {
  if (state.currentPrice == null) return null;
  const current = roundMoney(state.currentPrice);
  const open = state.openTasks
    .filter(
      (task) =>
        task.kind === 'MANUAL_PRICE' &&
        task.status === 'OPEN' &&
        roundMoney(task.targetPrice) < current - 0.009,
    )
    .map((task) => roundMoney(task.targetPrice));
  if (open.length === 0) return null;
  return Math.min(...open);
}

function dropTiming(
  state: MarkdownItemState,
  intervalDays: number,
  now: Date,
  retryMs: number,
): 'due' | 'not_due' | 'retry_wait' | 'no_online' {
  if (!state.onlineSince) return 'no_online';
  const anchor = state.override?.lastAppliedAt ?? state.onlineSince;
  if (now.getTime() < anchor.getTime() + intervalDays * DAY_MS) return 'not_due';
  const lastAttempt = state.override?.lastAttemptAt ?? null;
  const lastApplied = state.override?.lastAppliedAt ?? null;
  if (lastAttempt && (!lastApplied || lastAttempt.getTime() > lastApplied.getTime())) {
    if (now.getTime() < lastAttempt.getTime() + retryMs) return 'retry_wait';
  }
  return 'due';
}

function isManualChannel(marketplaceId: string): boolean {
  return marketplaceId === 'KLEINANZEIGEN' || marketplaceId === 'VINTED';
}

function manualTask(
  projection: MarkdownProjectionState,
  nextPrice: number,
  ebayApiConfigured: boolean,
): ManualPriceTask {
  const message = priceDropMessage(nextPrice);
  let detail = `Auf ${marketplaceLabel(projection.marketplaceId)} gibt es keine Schnittstelle. Trag den Preis dort ein und bestätige die Senkung hier.`;
  if (projection.marketplaceId === 'EBAY') {
    detail = connectedEbayOffer(projection)
      ? 'eBay ist nicht eingerichtet. Senke den Preis selbst auf ebay.de und bestätige ihn hier.'
      : 'Diese eBay-Anzeige ist nicht über die Sell API veröffentlicht. Senke den Preis selbst auf ebay.de und bestätige ihn hier.';
    if (!ebayApiConfigured && connectedEbayOffer(projection)) {
      detail = 'eBay ist nicht eingerichtet. Senke den Preis selbst auf ebay.de und bestätige ihn hier.';
    }
  }
  return {
    projectionId: projection.id,
    marketplaceId: projection.marketplaceId,
    message,
    detail,
    copyText: formatPricePaste(nextPrice),
  };
}

function planSummary(
  effective: EffectiveMarkdown,
  defaultEnabled: boolean,
  pendingPrice: number | null,
): string {
  if (effective.stopped) return 'Gestoppt. Dieser Artikel wird nicht automatisch gesenkt.';
  if (effective.paused) return 'Pausiert. Es wird nichts gesenkt, bis du fortsetzt.';
  if (pendingPrice != null) {
    return `Die Senkung auf ${formatEuroDe(pendingPrice)} wartet auf deine Bestätigung.`;
  }
  if (!effective.running) {
    return defaultEnabled
      ? 'Dieser Artikel ist von der Vorgabe ausgenommen.'
      : 'Aus. Eingeschaltet wird nur, was du hier oder im Konto anmachst.';
  }
  if (effective.currentPrice == null) return 'Noch kein Verkaufspreis. Ohne Preis senkt die App nichts.';
  if (effective.floorPrice == null) {
    return 'Mindestpreis fehlt. Trag ihn ein oder lass zuerst den Preisvorschlag rechnen. Darunter senkt die App nichts.';
  }
  if (effective.reachedFloor) {
    return `Mindestpreis erreicht (${formatEuroDe(effective.floorPrice)}). Der Preis bleibt.`;
  }
  const rhythm = effective.intervalDays === 1 ? 'Jeden Tag' : `Alle ${effective.intervalDays} Tage`;
  const percent = Number.isInteger(effective.percent)
    ? String(effective.percent)
    : effective.percent.toLocaleString('de-DE');
  const floorNote =
    effective.floorSource === 'SUGGESTION' ? ' Der Mindestpreis kommt aus dem Preisvorschlag.' : '';
  const next = effective.nextPrice != null ? ` Nächster Preis ${formatEuroDe(effective.nextPrice)}.` : '';
  return `${rhythm} um ${percent} % senken, bis ${formatEuroDe(effective.floorPrice)}.${next}${floorNote}`;
}

function lowerPriceSuggestion(state: MarkdownItemState, effective: EffectiveMarkdown): AttentionSuggestion {
  const open = state.openTasks.find((task) => task.kind === 'MANUAL_PRICE' && task.status === 'OPEN');
  if (effective.waitingForConfirm && open) {
    return {
      kind: 'LOWER_PRICE',
      title: 'Preis senken',
      detail: `Die Aufgabe „${open.message}“ ist noch offen.`,
    };
  }
  if (effective.reachedFloor && effective.floorPrice != null) {
    return {
      kind: 'LOWER_PRICE',
      title: 'Preis senken',
      detail: `Der Mindestpreis ${formatEuroDe(effective.floorPrice)} ist erreicht.`,
    };
  }
  if (effective.nextPrice != null) {
    const detail = effective.running
      ? `Die automatische Senkung geht als Nächstes auf ${formatEuroDe(effective.nextPrice)}.`
      : effective.paused
        ? `Pausiert. Fortsetzen würde auf ${formatEuroDe(effective.nextPrice)} senken.`
        : `Automatische Senkung ist aus. Eingeschaltet ginge der Preis auf ${formatEuroDe(effective.nextPrice)}.`;
    return { kind: 'LOWER_PRICE', title: 'Preis senken', detail };
  }
  return {
    kind: 'LOWER_PRICE',
    title: 'Preis senken',
    detail: 'Mindestpreis fehlt. Trag ihn am Artikel ein, sonst senkt die App nichts.',
  };
}

function photoSuggestion(photoCount: number): AttentionSuggestion {
  if (photoCount <= 0) {
    return {
      kind: 'IMPROVE_PHOTOS',
      title: 'Fotos verbessern',
      detail: 'Es ist kein Foto hinterlegt. Mehr Fotos helfen beim Verkauf.',
    };
  }
  if (photoCount < 3) {
    const noun = photoCount === 1 ? 'Foto' : 'Fotos';
    return {
      kind: 'IMPROVE_PHOTOS',
      title: 'Fotos verbessern',
      detail: `Nur ${photoCount} ${noun}. Schaden, Etikett und Maße sollten zu sehen sein.`,
    };
  }
  return {
    kind: 'IMPROVE_PHOTOS',
    title: 'Fotos verbessern',
    detail: 'Prüfe, ob Zustand, Etikett und Maße auf den Fotos zu erkennen sind.',
  };
}
