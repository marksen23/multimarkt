export interface MarketKeywordInput {
  title?: string | null;
  brand?: string | null;
  category?: string | null;
  categoryDetail?: string | null;
  color?: string | null;
}

/**
 * Suchbegriffe für Vergleichsangebote. Die grobe Taxonomie
 * („Kleidung“, „Schuhe“) ist allein ein schlechter Suchbegriff; eine
 * konkrete Artikelart oder der Titel geht vor.
 */
export function buildMarketKeywords(input: MarketKeywordInput): string {
  const brand = tidy(input.brand);
  const detail = specificDetail(input.categoryDetail);
  const category = tidy(input.category);
  const title = tidy(input.title);
  const color = tidy(input.color);

  // „Kleidung“ allein ist ein schlechter Suchbegriff. Eine konkrete
  // Artikelart oder der Titel geht vor. „Sneaker“ als Kategorie bleibt,
  // weil das schon der Suchbegriff ist.
  const specificCategory = category && !isCoarseCategory(category) ? category : null;
  const product = detail ?? specificCategory;
  const parts = [brand, product].filter((part): part is string => !!part);
  if (parts.length === 0) {
    if (title) parts.push(title);
    else if (category) parts.push(category);
  } else if (title && !detail && !specificCategory && !containsFolded(parts.join(' '), title)) {
    parts.push(title);
  }

  const joined = parts.join(' ');
  if (color && !containsFolded(joined, color)) parts.push(color);

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
