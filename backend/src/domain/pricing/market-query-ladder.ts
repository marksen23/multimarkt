import { isCoarseMarketCategory, MarketKeywordInput, buildMarketKeywords } from './market-keywords';

export type MarketQueryLevel = 'specific' | 'broader' | 'broad';

export interface MarketQueryStep {
  keywords: string;
  level: MarketQueryLevel;
}

export interface MarketSpec {
  key: string;
  value: string | null;
}

const ELECTRICAL = /^\d+(?:[.,]\d+)?\s*(?:v|w|kw|hz|a|mm|cm|m|kg|g|mah|rpm|°c)$/i;

/**
 * Von der engen Suche zur Artikelart. Die erste Stufe nutzt Suchbegriffe
 * der Fotoanalyse, Marke, Modell und eine Typenschild-Nummer. Farbe und
 * die Nummer fallen in der nächsten Stufe weg, wenn sie die Suche leer lassen.
 */
export function buildMarketQueryLadder(
  input: MarketKeywordInput & { specs?: MarketSpec[] },
): MarketQueryStep[] {
  const specToken = distinctiveSpec(input.specs ?? []);
  const specific = appendToken(buildMarketKeywords(input), specToken);
  const broader = buildMarketKeywords({ ...input, searchTerms: null, color: null });
  const broad = productOnly(input);

  const steps: MarketQueryStep[] = [];
  push(steps, specific, 'specific');
  push(steps, broader, 'broader');
  push(steps, broad, 'broad');
  return steps;
}

export function marketProductLabel(input: MarketKeywordInput): string | null {
  return productOnly(input);
}

function distinctiveSpec(specs: MarketSpec[]): string | null {
  for (const spec of specs) {
    const key = spec.key.replace(/^spec:/i, '').trim();
    if (/serien|serial/i.test(key)) continue;
    const value = tidy(spec.value);
    if (!value || value.length < 3 || value.length > 24) continue;
    if (value.split(' ').length > 3) continue;
    if (!/\d/.test(value)) continue;
    if (ELECTRICAL.test(value)) continue;
    return value;
  }
  return null;
}

function productOnly(input: MarketKeywordInput): string | null {
  const detail = lastSegment(input.categoryDetail);
  if (detail && !isCoarseMarketCategory(detail)) return detail;
  const category = tidy(input.category);
  if (category && !isCoarseMarketCategory(category)) return category;
  return tidy(input.title);
}

function lastSegment(value: string | null | undefined): string | null {
  const cleaned = tidy(value);
  if (!cleaned) return null;
  const segments = cleaned
    .split('>')
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments[segments.length - 1] ?? null;
}

function appendToken(base: string, token: string | null): string {
  if (!token) return base;
  if (base.toLocaleLowerCase('de-DE').includes(token.toLocaleLowerCase('de-DE'))) return base;
  return `${base} ${token}`.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function push(steps: MarketQueryStep[], keywords: string | null, level: MarketQueryLevel): void {
  const cleaned = (keywords ?? '').replace(/\s+/g, ' ').trim();
  if (!cleaned || isCoarseMarketCategory(cleaned)) return;
  const folded = cleaned.toLocaleLowerCase('de-DE');
  if (steps.some((step) => step.keywords.toLocaleLowerCase('de-DE') === folded)) return;
  steps.push({ keywords: cleaned, level });
}

function tidy(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
}
