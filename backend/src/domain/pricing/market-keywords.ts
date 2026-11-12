export interface MarketKeywordInput {
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
  categoryDetail?: string | null;
  color?: string | null;
  /** Von der Bildanalyse vorgeschlagene Suchphrase. Geht vor dem Titel. */
  searchTerms?: string | null;
}

/**
 * Suchbegriffe für Vergleichsangebote. Die grobe Taxonomie
 * („Kleidung“, „Schuhe“) ist allein ein schlechter Suchbegriff; eine
 * konkrete Artikelart oder der Titel geht vor.
 */
export function buildMarketKeywords(input: MarketKeywordInput): string {
  const color = tidy(input.color);
  const searchTerms = tidy(input.searchTerms);
  if (searchTerms) {
    return withColor(searchTerms, color);
  }

  const brand = tidy(input.brand);
  const model = tidy(input.model);
  const detail = specificDetail(input.categoryDetail);
  const category = tidy(input.category);
  const title = tidy(input.title);

  // „Kleidung“ allein ist ein schlechter Suchbegriff. Eine konkrete
  // Artikelart, das Modell oder der Titel geht vor. „Sneaker“ als
  // Kategorie bleibt, weil das schon der Suchbegriff ist.
  const specificCategory = category && !isCoarseCategory(category) ? category : null;
  const product = detail ?? specificCategory;
  const parts: string[] = [];
  if (brand) parts.push(brand);
  if (model && product && containsFolded(product, model)) {
    if (!containsFolded(parts.join(' '), product)) parts.push(product);
  } else {
    if (model && !containsFolded(parts.join(' '), model)) parts.push(model);
    if (product && !containsFolded(parts.join(' '), product)) parts.push(product);
  }
  if (parts.length === 0) {
    if (title) parts.push(title);
    else if (category) parts.push(category);
  } else if (title && !detail && !specificCategory && !model && !containsFolded(parts.join(' '), title)) {
    parts.push(title);
  }

  return withColor(parts.join(' '), color);
}

function withColor(base: string, color: string | null): string {
  const parts = [collapse(base)];
  if (color && !containsFolded(parts[0], color)) parts.push(color);
  return collapse(parts.join(' ')).slice(0, 120);
}

const COARSE_CATEGORIES = new Set([
  'kleidung',
  'schuhe',
  'elektronik',
  'medien',
  'haushalt',
  'moebel',
  'möbel',
  'sonstiges',
]);

function isCoarseCategory(value: string): boolean {
  return COARSE_CATEGORIES.has(value.toLocaleLowerCase('de-DE'));
}

function specificDetail(value: string | null | undefined): string | null {
  const cleaned = tidy(value);
  if (!cleaned) return null;
  const segments = cleaned
    .split('>')
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments[segments.length - 1] ?? null;
}

function tidy(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
}

function containsFolded(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase('de-DE').includes(needle.toLocaleLowerCase('de-DE'));
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
