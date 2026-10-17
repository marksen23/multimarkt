import { createHash } from 'node:crypto';
import { computeExpectedMargin, roundMoney } from '../pricing/expected-margin';

/**
 * Bundle-Vorschläge (Feature-Plan 3.8).
 *
 * Mehrere bereite Artikel, die denselben Freitext bei Kategorie, Größe
 * oder Marke tragen und deren Einzelmarge unter der gesetzten Schwelle
 * liegt, werden als Abholpaket vorgeschlagen. Die Schwelle ist dieselbe
 * wie bei „nicht einzeln verkaufen“: Marge nach Gebühr, Versand und
 * Einstand. Ohne Schwelle oder ohne Einstand gibt es keinen Vorschlag.
 *
 * Kein Kategoriebaum. Verglichen wird der gespeicherte Attributtext.
 */

export const MIN_BUNDLE_ITEMS = 2;

const DIMENSIONS = ['size', 'brand', 'category'] as const;
export type BundleMatchDimension = (typeof DIMENSIONS)[number];

const KEYS_BY_DIMENSION: Record<BundleMatchDimension, readonly string[]> = {
  size: ['size', 'größe', 'groesse'],
  brand: ['brand', 'marke'],
  category: ['category', 'kategorie'],
};

const DIMENSION_LABEL: Record<BundleMatchDimension, string> = {
  size: 'Größe',
  brand: 'Marke',
  category: 'Kategorie',
};

/** Leere oder nichtssagende Freitexte ergeben kein Paket. */
const SKIPPED_VALUES = new Set([
  'unbekannt',
  'unknown',
  'sonstiges',
  'sonstige',
  'markenlos',
  'markenlos / sonstige',
  'n/a',
  'na',
  'keine',
  'keine angabe',
  '-',
  '–',
]);

export interface BundleSuggestionAttribute {
  key: string;
  value: string | null;
}

export interface BundleSuggestionCandidate {
  id: string;
  title: string | null;
  salePriceEur: number;
  purchasePriceEur: number | null;
  /** Versand, den der Einzelverkauf tragen würde. Abholung im Paket ist 0 €. */
  singleShippingEur: number;
  attributes: BundleSuggestionAttribute[];
}

export interface BundleSuggestionItem {
  id: string;
  title: string | null;
  salePriceEur: number;
  singleNetEur: number;
  marginEur: number;
  shippingEur: number;
}

export interface BundleSuggestion {
  fingerprint: string;
  title: string;
  description: string;
  dimension: BundleMatchDimension;
  dimensionLabel: string;
  matchValue: string;
  itemIds: string[];
  items: BundleSuggestionItem[];
  suggestedPriceEur: number;
  bundleNetEur: number;
  bundleMarginEur: number;
  thresholdEur: number;
}

export interface BundleSuggestionResult {
  thresholdEur: number | null;
  suggestions: BundleSuggestion[];
}

export interface MarketPriceSample {
  source: string;
  median: number | null;
  sampleSize: number;
  fetchedAtMs: number;
}

/**
 * Angebotspreis für den Einzelnetto. Die letzte Marktquelle mit der
 * größten Stichprobe. Der Ankaufsanker bleibt außen vor (Mock, Feature 2.3).
 */
export function pickMarketSalePrice(
  samples: MarketPriceSample[],
): number | null {
  const newestBySource = new Map<string, MarketPriceSample>();
  for (const sample of samples) {
    if (sample.source === 'ANKAUF_PORTAL') continue;
    const current = newestBySource.get(sample.source);
    if (!current || sample.fetchedAtMs >= current.fetchedAtMs) {
      newestBySource.set(sample.source, sample);
    }
  }
  const usable = [...newestBySource.values()].filter(
    (sample): sample is MarketPriceSample & { median: number } =>
      sample.median != null && sample.median > 0,
  );
  if (usable.length === 0) return null;
  usable.sort(
    (a, b) => b.sampleSize - a.sampleSize || b.fetchedAtMs - a.fetchedAtMs,
  );
  return roundMoney(usable[0].median);
}

export function suggestBundles(input: {
  items: BundleSuggestionCandidate[];
  feePercent: number;
  singleSaleThresholdEur: number | null;
  dismissedFingerprints: readonly string[];
}): BundleSuggestionResult {
  const threshold = input.singleSaleThresholdEur;
  if (threshold == null) {
    return { thresholdEur: null, suggestions: [] };
  }

  const eligible = input.items.flatMap((item) => {
    const priced = priceItem(item, input.feePercent, threshold);
    return priced ? [priced] : [];
  });

  const dismissed = new Set(input.dismissedFingerprints);
  const covered = new Set<string>();
  const suggestions: BundleSuggestion[] = [];

  // Größe vor Marke vor Kategorie: ein Pullover-Paket gleicher Größe
  // schlägt ein loseres Kategorie-Paket derselben Stücke.
  for (const dimension of DIMENSIONS) {
    for (const group of groupBy(eligible, dimension)) {
      const fresh = group.filter((item) => !covered.has(item.id));
      if (fresh.length < MIN_BUNDLE_ITEMS) continue;

      const suggestion = buildSuggestion(
        dimension,
        fresh,
        input.feePercent,
        threshold,
      );
      if (!suggestion) continue;

      for (const item of fresh) covered.add(item.id);
      if (dismissed.has(suggestion.fingerprint)) continue;
      suggestions.push(suggestion);
    }
  }

  return { thresholdEur: threshold, suggestions };
}

interface PricedItem extends BundleSuggestionCandidate {
  purchasePriceEur: number;
  singleNetEur: number;
  marginEur: number;
}

function priceItem(
  item: BundleSuggestionCandidate,
  feePercent: number,
  threshold: number,
): PricedItem | null {
  if (!(item.salePriceEur > 0) || item.purchasePriceEur == null) return null;
  const margin = computeExpectedMargin({
    salePriceEur: item.salePriceEur,
    purchasePriceEur: item.purchasePriceEur,
    feePercent,
    shippingEur: item.singleShippingEur,
    singleSaleThresholdEur: threshold,
  });
  if (margin.marginEur == null || !margin.belowSingleSaleThreshold) return null;
  return {
    ...item,
    purchasePriceEur: item.purchasePriceEur,
    singleNetEur: margin.expectedNetEur,
    marginEur: margin.marginEur,
  };
}

function groupBy(
  items: PricedItem[],
  dimension: BundleMatchDimension,
): PricedItem[][] {
  const groups = new Map<string, PricedItem[]>();
  for (const item of items) {
    const raw = attributeRaw(item.attributes, dimension);
    if (!raw) continue;
    const key = normalizeAttributeText(raw);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()].sort(
    (a, b) => b.length - a.length || a[0].id.localeCompare(b[0].id),
  );
}

function buildSuggestion(
  dimension: BundleMatchDimension,
  items: PricedItem[],
  feePercent: number,
  threshold: number,
): BundleSuggestion | null {
  const matchValue = displayValue(
    items.map((item) => attributeRaw(item.attributes, dimension) ?? ''),
  );
  if (!matchValue) return null;

  const salePriceEur = roundMoney(
    items.reduce((sum, item) => sum + item.salePriceEur, 0),
  );
  const purchasePriceEur = roundMoney(
    items.reduce((sum, item) => sum + item.purchasePriceEur, 0),
  );
  // Ein Abholpaket: der Versand fällt einmal weg, nicht pro Stück.
  const bundle = computeExpectedMargin({
    salePriceEur,
    purchasePriceEur,
    feePercent,
    shippingEur: 0,
    singleSaleThresholdEur: threshold,
  });
  if (bundle.marginEur == null || bundle.marginEur < threshold) return null;

  const itemIds = items.map((item) => item.id).sort();
  const categoryValue =
    dimension === 'category' ? null : sharedDisplay(items, 'category');
  const title = suggestionTitle(
    dimension,
    matchValue,
    items.length,
    categoryValue,
  );
  const description = suggestionDescription({
    count: items.length,
    dimension,
    matchValue,
    threshold,
    suggestedPriceEur: salePriceEur,
    bundleMarginEur: bundle.marginEur,
    shippingHurts: items.some((item) => item.singleShippingEur > 0),
  });

  return {
    fingerprint: fingerprintOf(
      dimension,
      normalizeAttributeText(matchValue),
      itemIds,
    ),
    title,
    description,
    dimension,
    dimensionLabel: DIMENSION_LABEL[dimension],
    matchValue,
    itemIds,
    items: items
      .slice()
      .sort(
        (a, b) =>
          (a.title ?? '').localeCompare(b.title ?? '', 'de') ||
          a.id.localeCompare(b.id),
      )
      .map((item) => ({
        id: item.id,
        title: item.title,
        salePriceEur: roundMoney(item.salePriceEur),
        singleNetEur: item.singleNetEur,
        marginEur: item.marginEur,
        shippingEur: roundMoney(item.singleShippingEur),
      })),
    suggestedPriceEur: salePriceEur,
    bundleNetEur: bundle.expectedNetEur,
    bundleMarginEur: bundle.marginEur,
    thresholdEur: threshold,
  };
}

function suggestionTitle(
  dimension: BundleMatchDimension,
  matchValue: string,
  count: number,
  categoryValue: string | null,
): string {
  const pieces = `${count} ${count === 1 ? 'Teil' : 'Teile'}`;
  if (dimension === 'size') {
    const head = categoryValue
      ? `${categoryValue} Größe ${matchValue}`
      : `Größe ${matchValue}`;
    return `${head} (${pieces}), nur Abholung`;
  }
  if (dimension === 'brand') {
    const head = categoryValue ? `${categoryValue} ${matchValue}` : matchValue;
    return `${head} (${pieces}), nur Abholung`;
  }
  return `${matchValue} (${pieces}), nur Abholung`;
}

function suggestionDescription(input: {
  count: number;
  dimension: BundleMatchDimension;
  matchValue: string;
  threshold: number;
  suggestedPriceEur: number;
  bundleMarginEur: number;
  shippingHurts: boolean;
}): string {
  const label = DIMENSION_LABEL[input.dimension];
  const parts = [
    `${input.count} Artikel teilen die ${label} „${input.matchValue}“.`,
    `Einzeln liegt die Marge unter deiner Schwelle von ${money(input.threshold)}.`,
  ];
  if (input.shippingHurts) {
    parts.push('Der Versand macht den Einzelverkauf unattraktiv.');
  }
  parts.push(
    `Als Abholpaket für ${money(input.suggestedPriceEur)} bleibt eine Marge von ${money(input.bundleMarginEur)}.`,
  );
  return parts.join(' ');
}

function sharedDisplay(
  items: PricedItem[],
  dimension: BundleMatchDimension,
): string | null {
  const raws: string[] = [];
  for (const item of items) {
    const raw = attributeRaw(item.attributes, dimension);
    if (!raw) return null;
    raws.push(raw);
  }
  const key = normalizeAttributeText(raws[0]);
  if (!raws.every((raw) => normalizeAttributeText(raw) === key)) return null;
  return displayValue(raws);
}

function attributeRaw(
  attributes: BundleSuggestionAttribute[],
  dimension: BundleMatchDimension,
): string | null {
  const byKey = new Map<string, string | null>();
  for (const attribute of attributes) {
    byKey.set(normalizeAttributeText(attribute.key), attribute.value);
  }
  for (const key of KEYS_BY_DIMENSION[dimension]) {
    const value = byKey.get(key);
    if (value == null) continue;
    const trimmed = value.trim().replace(/\s+/g, ' ');
    if (!trimmed || SKIPPED_VALUES.has(normalizeAttributeText(trimmed)))
      continue;
    return trimmed;
  }
  return null;
}

function displayValue(raws: string[]): string {
  const counts = new Map<string, { raw: string; count: number }>();
  for (const raw of raws) {
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    if (!trimmed) continue;
    const key = normalizeAttributeText(trimmed);
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { raw: trimmed, count: 1 });
  }
  const ranked = [...counts.values()].sort(
    (a, b) => b.count - a.count || a.raw.localeCompare(b.raw, 'de'),
  );
  return ranked[0]?.raw ?? '';
}

function normalizeAttributeText(value: string): string {
  return value.trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');
}

function fingerprintOf(
  dimension: BundleMatchDimension,
  normalizedValue: string,
  itemIds: string[],
): string {
  const payload = [dimension, normalizedValue, ...itemIds].join('\n');
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function money(value: number): string {
  return `${value.toFixed(2)} €`;
}
