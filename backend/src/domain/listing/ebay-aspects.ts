import { fold } from '../category/taxonomy';

export interface EbayAspectDefinition {
  name: string;
  required: boolean;
}

export interface FilledEbayAspects {
  aspects: Record<string, string[]>;
  missing: string[];
}

const ATTRIBUTE_ASPECTS: { key: 'brand' | 'color' | 'material' | 'model'; names: string[] }[] = [
  { key: 'brand', names: ['marke', 'brand'] },
  { key: 'color', names: ['farbe', 'color', 'colour'] },
  { key: 'material', names: ['material'] },
  { key: 'model', names: ['modell', 'model'] },
];

function normalizedAspectName(name: string): string {
  return fold(name)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function attributeForAspect(name: string): 'brand' | 'color' | 'material' | 'model' | 'size' | null {
  const normalized = normalizedAspectName(name);
  if (!normalized) return null;
  for (const entry of ATTRIBUTE_ASPECTS) {
    if (entry.names.includes(normalized)) return entry.key;
  }
  const sizeLike = normalized === 'groesse' || normalized === 'size' || normalized.includes('groesse');
  if (!sizeLike) return null;
  // US-/UK-Größen nicht mit einer EU-Angabe füllen.
  if (/\bus\b/.test(normalized) || /\buk\b/.test(normalized)) return null;
  return 'size';
}

function cleanValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  return trimmed.slice(0, 65);
}

/**
 * Pflicht-Angaben nur aus bestätigten Attributen. Die Marke darf den
 * bestehenden Ersatzwert „Markenlos / Sonstige“ nutzen, wenn die
 * Capability-Prüfung ihn für diese Projektion freigegeben hat. Andere
 * fehlende Pflichtangaben bleiben eine Lücke, kein erfundener Wert.
 */
export function fillEbayAspects(input: {
  definitions: EbayAspectDefinition[];
  attributes: Record<string, string | null | undefined>;
  brandFallback: string | null;
}): FilledEbayAspects {
  const aspects: Record<string, string[]> = {};
  const missing: string[] = [];

  for (const definition of input.definitions) {
    const key = attributeForAspect(definition.name);
    const own = key ? cleanValue(input.attributes[key]) : null;
    const value =
      own ??
      (key === 'brand' && definition.required ? cleanValue(input.brandFallback) : null);
    if (value) {
      aspects[definition.name] = [value];
      continue;
    }
    if (definition.required) missing.push(definition.name);
  }

  return { aspects, missing };
}
