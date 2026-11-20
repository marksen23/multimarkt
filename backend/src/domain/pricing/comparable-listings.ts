import { ComparableListing } from './market-distribution-provider.interface';
import { PriceCondition, priceConditionKey } from './condition-adjustment';

export interface CompFilterContext {
  keywords: string;
  brand?: string | null;
  model?: string | null;
  product?: string | null;
  itemCondition?: string | null;
  /** Enge Suche: ein Modellbegriff muss im Titel stehen. */
  requireModel?: boolean;
  /** Breite Suche nach der Artikelart verlangt die Marke nicht. */
  requireBrand?: boolean;
}

export interface FilteredComps {
  kept: ComparableListing[];
  excludedCount: number;
  filterNote: string | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
}

type ExcludeReason = 'accessory' | 'defect' | 'bundle' | 'condition' | 'currency' | 'unrelated' | 'outlier';

const REASON_LABELS: ExcludeReason[] = [
  'accessory',
  'defect',
  'bundle',
  'condition',
  'currency',
  'unrelated',
  'outlier',
];

const REASON_TEXT: Record<ExcludeReason, string> = {
  accessory: 'Zubehör',
  defect: 'Defekt',
  bundle: 'Konvolut',
  condition: 'falscher Zustand',
  currency: 'andere Währung',
  unrelated: 'anderes Produkt',
  outlier: 'Ausreißer',
};

const ACCESSORY_PATTERNS: RegExp[] = [
  /\b(hülle|huelle|case|cover|schutzfolie|panzerglas|displayschutz|schutzhülle|schutzhuelle)\b/i,
  /\b(ersatzteil|ersatzteile|zubehör|zubehoer|für teile|for parts)\b/i,
  /\b(ladegerät|ladegeraet|netzteil|ladekabel|ersatzakku)\b/i,
  /\b(nur gehäuse|nur gehaeuse|ohne gerät|ohne geraet|ohne akku)\b/i,
];

/**
 * Wirft Zubehör, Defekte, Konvolute, falschen Zustand, fremde Währung
 * und Preise weit weg vom Median raus. Was übrig bleibt, ist die Spanne.
 */
export function selectComparableListings(
  listings: ComparableListing[],
  context: CompFilterContext,
): FilteredComps {
  const reasons: ExcludeReason[] = [];
  const priced = listings.filter((listing) => Number.isFinite(listing.price) && listing.price > 0);
  const relevant: ComparableListing[] = [];

  for (const listing of priced) {
    const reason = rejectReason(listing, context);
    if (reason) reasons.push(reason);
    else relevant.push(listing);
  }

  const { kept, outlierCount } = dropOutliers(relevant);
  for (let i = 0; i < outlierCount; i += 1) reasons.push('outlier');

  const prices = kept.map((listing) => listing.price).sort((a, b) => a - b);
  return {
    kept,
    excludedCount: reasons.length,
    filterNote: filterNote(reasons),
    median: prices.length > 0 ? percentile(prices, 0.5) : null,
    p25: prices.length > 0 ? percentile(prices, 0.25) : null,
    p75: prices.length > 0 ? percentile(prices, 0.75) : null,
  };
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return round2(sorted[0]);
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const weight = idx - lo;
  return round2(sorted[lo] * (1 - weight) + sorted[hi] * weight);
}

function rejectReason(listing: ComparableListing, context: CompFilterContext): ExcludeReason | null {
  if (listing.currency && listing.currency.toUpperCase() !== 'EUR') return 'currency';

  const title = listing.title ?? '';
  const condition = priceConditionKey(context.itemCondition);
  if (isBundle(title)) return 'bundle';
  if (isAccessory(title, context)) return 'accessory';
  if (condition !== 'defective' && isDefect(title)) return 'defect';
  if (wrongCondition(title, condition)) return 'condition';
  if (!matchesIdentity(title, context)) return 'unrelated';
  return null;
}

function isAccessory(title: string, context: CompFilterContext): boolean {
  const haystack = `${context.keywords} ${context.product ?? ''}`;
  if (ACCESSORY_PATTERNS.some((pattern) => pattern.test(haystack))) return false;
  if (ACCESSORY_PATTERNS.some((pattern) => pattern.test(title))) return true;
  return accessoryForBrand(title, context);
}

function accessoryForBrand(title: string, context: CompFilterContext): boolean {
  const brand = tidy(context.brand);
  const model = tidy(context.model);
  if (!brand && !model) return false;
  const match = title.match(/\bfür\b/i);
  if (!match || match.index == null) return false;
  const after = foldKey(title.slice(match.index + match[0].length));
  const before = foldKey(title.slice(0, match.index));
  const brandKey = brand ? foldKey(brand) : '';
  const modelHit = model ? modelTokens(model).some((token) => after.includes(foldKey(token))) : false;
  const brandAfter = brandKey.length >= 2 && after.includes(brandKey);
  if (!brandAfter && !modelHit) return false;
  const startsWithIdentity =
    (brandKey.length >= 2 && before.startsWith(brandKey)) ||
    (model ? modelTokens(model).some((token) => before.startsWith(foldKey(token))) : false);
  return !startsWithIdentity;
}

function isDefect(title: string): boolean {
  return /\b(defekt|kaputt|bastler|ohne funktion|funktioniert nicht|for parts|nicht funktionsfähig|nicht funktionsfaehig)\b/i.test(
    title,
  );
}

function isBundle(title: string): boolean {
  return (
    /\b(konvolut|sammlung|posten|nachlass|bundle|mischposten)\b/i.test(title) ||
    /\b([2-9]|\d{2,})\s*(x|stück|stueck)\b/i.test(title) ||
    /\b\d+\s*er[-\s]?set\b/i.test(title)
  );
}

function wrongCondition(title: string, condition: PriceCondition | null): boolean {
  const fresh = isFreshTitle(title);
  if (condition === 'new') return isDefect(title) || /\bgebraucht\b/i.test(title);
  if (condition === 'defective') return fresh;
  return fresh;
}

function isFreshTitle(title: string): boolean {
  const folded = title.toLocaleLowerCase('de-DE');
  if (/\b(wie neu|neuwertig|fast neu)\b/.test(folded)) return false;
  if (/\b(ovp|originalverpackt|ungeöffnet|ungeoeffnet|neuware|versiegelt|fabrikneu)\b/.test(folded)) return true;
  return /\bneu\b/.test(folded);
}

function matchesIdentity(title: string, context: CompFilterContext): boolean {
  const folded = foldKey(title);
  const brand = tidy(context.brand);
  const model = tidy(context.model);
  const brandKey = brand ? foldKey(brand) : '';
  const brandOk = brandKey.length < 2 || folded.includes(brandKey);
  const modelOk = !model || hasModel(folded, model);

  if (context.requireModel && model && !modelOk) return false;
  if (context.requireBrand !== false && brandKey.length >= 2 && !brandOk && !(model && modelOk)) return false;
  if (context.requireBrand === false) {
    const product = tidy(context.product);
    if (product && !hasToken(folded, product) && !brandOk && !modelOk) return false;
  }
  return true;
}

function hasModel(foldedTitle: string, model: string): boolean {
  const tokens = modelTokens(model);
  if (tokens.length === 0) return true;
  return tokens.some((token) => foldedTitle.includes(foldKey(token)));
}

function hasToken(foldedTitle: string, phrase: string): boolean {
  const tokens = phrase
    .split(/[\s>&,/]+/)
    .map((token) => foldKey(token))
    .filter((token) => token.length >= 4);
  if (tokens.length === 0) return true;
  return tokens.some((token) => foldedTitle.includes(token));
}

function modelTokens(model: string): string[] {
  return model
    .split(/[\s/]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 || /\d/.test(token));
}

function dropOutliers(listings: ComparableListing[]): { kept: ComparableListing[]; outlierCount: number } {
  if (listings.length < 4) return { kept: listings, outlierCount: 0 };
  const sorted = listings.map((listing) => listing.price).sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  if (median <= 0) return { kept: listings, outlierCount: 0 };
  const low = median * 0.25;
  const high = median * 4;
  const kept = listings.filter((listing) => listing.price >= low && listing.price <= high);
  if (kept.length < 3) return { kept: listings, outlierCount: 0 };
  return { kept, outlierCount: listings.length - kept.length };
}

function filterNote(reasons: ExcludeReason[]): string | null {
  if (reasons.length === 0) return null;
  const present = REASON_LABELS.filter((reason) => reasons.includes(reason)).map((reason) => REASON_TEXT[reason]);
  const count = reasons.length === 1 ? '1 Anzeige weggelassen' : `${reasons.length} Anzeigen weggelassen`;
  return `${count}: ${present.join(', ')}.`;
}

function foldKey(value: string): string {
  return value.toLocaleLowerCase('de-DE').replace(/[^a-z0-9äöüß]+/gi, '');
}

function tidy(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
