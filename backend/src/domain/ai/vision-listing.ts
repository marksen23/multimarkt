import { AiAttributeClaim } from './ai-vision-provider.interface';
import {
  fold,
  normalizeFunctionChecked,
  projectVisionClaims,
  RESALE_CATEGORIES,
  VisionClaim,
} from '../category/taxonomy';

/**
 * Unter diesem Wert zeigt die Oberfläche das Feld als unsicher.
 * Der Wert bleibt ein Vorschlag, den ein Mensch bestätigt.
 */
export const UNCERTAIN_CONFIDENCE = 0.65;

/** So viele Fotos gehen an Gemini. Darüber bleiben die ersten und die letzten. */
export const MAX_VISION_IMAGES = 8;

export const VISION_FIELD_KEYS = [
  'category',
  'categoryDetail',
  'color',
  'brand',
  'model',
  'material',
  'condition',
  'size',
  'measurements',
  'functionChecked',
  'notable_features',
  'visible_defects',
] as const;

const LISTING_KEYS = ['title', 'description', 'searchTerms'] as const;

const PASSTHROUGH_KEYS = new Set<string>([
  'notable_features',
  'visible_defects',
  'model',
  'title',
  'description',
  'searchTerms',
]);

const FIELD_ALIASES: Record<string, readonly string[]> = {
  category: ['category', 'kategorie'],
  categoryDetail: ['categoryDetail', 'category_detail', 'artikelart', 'productType'],
  color: ['color', 'farbe', 'colour'],
  brand: ['brand', 'marke'],
  model: ['model', 'modell', 'modelNumber', 'modellnummer'],
  material: ['material'],
  condition: ['condition', 'zustand'],
  size: ['size', 'groesse', 'größe'],
  measurements: ['measurements', 'masse', 'maße', 'abmessungen'],
  functionChecked: ['functionChecked', 'function_checked', 'funktionGeprueft'],
  notable_features: ['notable_features', 'notableFeatures', 'besonderheiten'],
  visible_defects: ['visible_defects', 'visibleDefects', 'maengel', 'mängel'],
  title: ['title', 'titel'],
  description: ['description', 'beschreibung'],
  searchTerms: ['searchTerms', 'search_terms', 'suchbegriffe'],
};

const FIELD_MAX: Record<string, number> = {
  category: 40,
  categoryDetail: 80,
  color: 40,
  brand: 40,
  model: 60,
  material: 40,
  condition: 40,
  size: 24,
  measurements: 80,
  functionChecked: 24,
  notable_features: 160,
  visible_defects: 200,
  title: 80,
  description: 700,
  searchTerms: 120,
};

const PLACEHOLDERS = new Set([
  'unbekannt',
  'unknown',
  'n/a',
  'na',
  'n.a',
  'n.a.',
  'keine',
  'keiner',
  'keins',
  'keinerlei',
  'nicht erkennbar',
  'nicht sichtbar',
  'nicht lesbar',
  'keine angabe',
  'keine marke',
  'ohne marke',
  'no brand',
  'nicht vorhanden',
  'none',
  'null',
  'undefined',
  'k.a',
  'k.a.',
  'ka',
  '-',
  '–',
  '—',
  '?',
  'xxx',
  'unbekanntes modell',
  'nicht sicher',
  'siehe foto',
  'siehe fotos',
]);

export interface MappedVisionListing {
  attributes: AiAttributeClaim[];
}

export function emptyVisionAttributes(): AiAttributeClaim[] {
  return VISION_FIELD_KEYS.map((key) => ({ key, value: null, confidence: 0 }));
}

export function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Erste Fotos plus die letzten, damit ein nachgereichtes Typenschild nicht wegfällt. */
export function selectVisionImageUrls(urls: string[], limit = MAX_VISION_IMAGES): string[] {
  if (urls.length <= limit) return [...urls];
  const tailCount = Math.min(2, limit);
  const headCount = limit - tailCount;
  return [...urls.slice(0, headCount), ...urls.slice(-tailCount)];
}

export function sanitizeVisionHint(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = stripControls(raw).replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2) return null;
  return cleaned.slice(0, 200);
}

/**
 * Rohes Gemini-JSON (auch mit nackten Strings oder deutschen Schlüsseln)
 * auf Claims. Erfindet nichts: Platzhalter, unlesbare Zustände und leere
 * Felder werden null. `spec:`-Angaben bleiben nur, wenn Name und Wert
 * brauchbar sind.
 */
export function mapVisionPayload(raw: Record<string, unknown>): MappedVisionListing {
  const claims = new Map<string, AiAttributeClaim>();

  for (const key of VISION_FIELD_KEYS) {
    const parsed = readField(raw, key);
    claims.set(key, { key, value: parsed.value, confidence: parsed.value ? parsed.confidence : 0 });
  }

  const condition = claims.get('condition');
  if (condition) {
    const normalized = normalizeCondition(condition.value);
    claims.set('condition', {
      key: 'condition',
      value: normalized,
      confidence: normalized ? condition.confidence : 0,
    });
  }

  const checked = claims.get('functionChecked');
  if (checked) {
    const normalized = normalizeFunctionAnswer(checked.value);
    claims.set('functionChecked', {
      key: 'functionChecked',
      value: normalized,
      confidence: normalized ? checked.confidence : 0,
    });
  }

  const defects = claims.get('visible_defects');
  if (defects?.value && isEmptyDefectPhrase(defects.value)) {
    claims.set('visible_defects', { key: 'visible_defects', value: null, confidence: 0 });
  }

  const listing: AiAttributeClaim[] = [];
  for (const key of LISTING_KEYS) {
    const parsed = readField(raw, key);
    if (!parsed.value) continue;
    if (key === 'description' && parsed.value.length < 20) continue;
    listing.push({ key, value: parsed.value, confidence: parsed.confidence });
  }

  const search = listing.find((claim) => claim.key === 'searchTerms');
  if (!search) {
    const composed = composeSearchTerms(claims);
    if (composed) listing.push(composed);
  }

  const attributes = VISION_FIELD_KEYS.map((key) => claims.get(key)!);
  return { attributes: [...attributes, ...listing, ...readSpecs(raw.specs)] };
}

/**
 * Taxonomie-Projektion plus Modell, Titel, Beschreibung, Suchbegriffe
 * und Typenschild-Angaben. Leere Werte bleiben nur als Lücke der Kategorie.
 */
export function claimsForStorage(raw: VisionClaim[]): VisionClaim[] {
  const projected = projectVisionClaims(raw);
  const seen = new Set(projected.map((claim) => claim.key));
  const extras = raw.filter((claim) => {
    if (!claim.value?.trim() || seen.has(claim.key)) return false;
    if (PASSTHROUGH_KEYS.has(claim.key)) return true;
    return isSpecKey(claim.key);
  });
  return [...projected, ...extras];
}

export function nextItemTitle(input: {
  current: string | null;
  previousAiTitle: string | null;
  previousConfirmed: boolean;
  suggested: string | null;
}): string | null {
  const current = blank(input.current);
  const suggested = blank(input.suggested);
  if (!suggested) return current;
  if (!current) return suggested;
  if (input.previousConfirmed) return current;
  const previous = blank(input.previousAiTitle);
  if (previous && current === previous) return suggested;
  return current;
}

function readField(raw: Record<string, unknown>, key: string): { value: string | null; confidence: number } {
  const parsed = parseClaim(lookup(raw, FIELD_ALIASES[key] ?? [key]));
  const max = FIELD_MAX[key] ?? 80;
  const value = parsed.value ? clip(parsed.value, max) : null;
  if (!value) return { value: null, confidence: 0 };
  return { value, confidence: parsed.confidence };
}

function lookup(raw: Record<string, unknown>, aliases: readonly string[]): unknown {
  const wanted = new Set(aliases.map((alias) => alias.toLowerCase()));
  for (const [key, value] of Object.entries(raw)) {
    if (wanted.has(key.toLowerCase())) return value;
  }
  return undefined;
}

function parseClaim(raw: unknown): { value: string | null; confidence: number } {
  if (raw == null) return { value: null, confidence: 0 };
  if (typeof raw === 'string' || typeof raw === 'number') {
    return { value: cleanScalar(String(raw)), confidence: 0.5 };
  }
  if (typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    const inner = record.value ?? record.text;
    const confidence = clampConfidence(
      typeof record.confidence === 'number' ? record.confidence : 0.5,
    );
    if (typeof inner === 'string' || typeof inner === 'number') {
      return { value: cleanScalar(String(inner)), confidence };
    }
  }
  return { value: null, confidence: 0 };
}

function cleanScalar(value: string): string | null {
  const collapsed = stripQuotes(stripControls(value).replace(/\s+/g, ' ').trim());
  if (!collapsed) return null;
  const folded = fold(collapsed).replace(/\.$/, '');
  if (PLACEHOLDERS.has(folded) || PLACEHOLDERS.has(collapsed.toLowerCase())) return null;
  return collapsed;
}

function stripQuotes(value: string): string {
  return value.replace(/^["„“«»']+|["„“«»']+$/g, '').trim();
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  const sliced = value.slice(0, max);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? sliced.slice(0, lastSpace) : sliced).trim();
}

function blank(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
}

export function normalizeCondition(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const folded = fold(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (['defective', 'defekt', 'kaputt'].includes(folded)) return 'defective';
  if (
    ['like new', 'like_new', 'wie neu', 'neuwertig', 'sehr gut', 'unbenutzt'].includes(folded) ||
    folded.includes('wie neu') ||
    folded.includes('neuwertig')
  ) {
    return 'like_new';
  }
  if (['new', 'neu', 'ovp', 'ungeoeffnet', 'originalverpackt'].includes(folded)) return 'new';
  if (['fair', 'gebraucht', 'abgenutzt'].includes(folded) || folded.includes('gebraucht')) return 'fair';
  if (['good', 'gut'].includes(folded)) return 'good';
  return null;
}

function normalizeFunctionAnswer(value: string | null): string | null {
  if (!value) return null;
  return normalizeFunctionChecked(value) ?? normalizeFunctionChecked(value.split(/[\s,.;]+/)[0] ?? '');
}

function isEmptyDefectPhrase(value: string): boolean {
  const folded = fold(value);
  if (value.length > 48) return false;
  return /^(keine|kein|nichts|ohne)\b/.test(folded);
}

function composeSearchTerms(claims: Map<string, AiAttributeClaim>): AiAttributeClaim | null {
  const brand = claims.get('brand')?.value ?? null;
  const model = claims.get('model')?.value ?? null;
  const detail = claims.get('categoryDetail')?.value ?? null;
  const product = detail && !isCoarseCategory(detail) ? detail : null;
  const parts: string[] = [];
  const used: number[] = [];
  const take = (key: string, value: string) => {
    parts.push(value);
    used.push(claims.get(key)?.confidence ?? 0.5);
  };
  if (brand) take('brand', brand);
  if (model && product && containsFolded(product, model)) {
    if (!containsFolded(parts.join(' '), product)) take('categoryDetail', product);
  } else {
    if (model && !containsFolded(parts.join(' '), model)) take('model', model);
    if (product && !containsFolded(parts.join(' '), product)) take('categoryDetail', product);
  }
  const joined = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (joined.length < 3) return null;
  const confidence = used.length ? Math.min(...used) : 0.5;
  return { key: 'searchTerms', value: clip(joined, FIELD_MAX.searchTerms), confidence };
}

function isCoarseCategory(value: string): boolean {
  const folded = fold(value);
  return RESALE_CATEGORIES.some((category) => fold(category) === folded);
}

function containsFolded(haystack: string, needle: string): boolean {
  if (!haystack.trim() || !needle.trim()) return false;
  return fold(haystack).includes(fold(needle));
}

function readSpecs(raw: unknown): AiAttributeClaim[] {
  if (!Array.isArray(raw)) return [];
  const best = new Map<string, AiAttributeClaim>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name : typeof record.key === 'string' ? record.key : '';
    const key = specAttributeKey(name);
    const value =
      typeof record.value === 'string' || typeof record.value === 'number'
        ? cleanScalar(String(record.value))
        : null;
    if (!key || !value) continue;
    const clipped = clip(value, 80);
    if (!clipped) continue;
    const confidence = clampConfidence(typeof record.confidence === 'number' ? record.confidence : 0.5);
    const previous = best.get(key);
    if (!previous || confidence >= previous.confidence) {
      best.set(key, { key, value: clipped, confidence });
    }
  }
  return [...best.values()].slice(0, 6);
}

function stripControls(value: string): string {
  let cleaned = '';
  for (const char of value) {
    cleaned += char.charCodeAt(0) < 32 ? ' ' : char;
  }
  return cleaned;
}

function specAttributeKey(name: string): string | null {
  const cleaned = stripControls(name).replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2 || cleaned.length > 40) return null;
  if (/^spec:/i.test(cleaned)) return null;
  if (!/^[\p{L}\d][\p{L}\d ./%+-]*$/u.test(cleaned)) return null;
  return `spec:${cleaned}`;
}

function isSpecKey(key: string): boolean {
  return key.startsWith('spec:') && key.length > 'spec:'.length && !key.slice(5).includes(':');
}
