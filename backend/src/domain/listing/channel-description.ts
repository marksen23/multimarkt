import { ListingChannel } from '../ai/title-generation-provider.interface';

export interface ChannelDescriptionFacts {
  title: string | null;
  condition: string | null;
  attributes: { key: string; value: string | null }[];
  /** Suchbegriffe aus der Lückenanalyse. Nur einbauen, wenn sie schon Fakt sind. */
  missingTokens: string[];
}

const CONDITION_LABELS: Record<string, string> = {
  new: 'neu',
  like_new: 'unbenutzt',
  good: 'gebraucht',
  fair: 'gebraucht, Spuren vorhanden',
  defective: 'defekt',
};

const ATTRIBUTE_KEYS: Record<string, string[]> = {
  brand: ['brand', 'marke'],
  category: ['category', 'kategorie'],
  color: ['color', 'farbe', 'colour'],
  size: ['size', 'größe', 'groesse', 'size_label'],
  material: ['material', 'material'],
  measurements: ['measurements', 'maße', 'masse', 'dimensions', 'länge', 'laenge'],
  included: ['lieferumfang', 'included', 'zubehör', 'zubehoer', 'accessories'],
};

function attribute(facts: ChannelDescriptionFacts, group: keyof typeof ATTRIBUTE_KEYS): string | null {
  const keys = new Set(ATTRIBUTE_KEYS[group].map((key) => key.toLowerCase()));
  const found = facts.attributes.find(
    (entry) => entry.value && keys.has(entry.key.trim().toLowerCase()),
  );
  const value = found?.value?.trim();
  return value ? value : null;
}

export function conditionLabel(condition: string | null): string {
  if (!condition?.trim()) return 'nicht angegeben';
  return CONDITION_LABELS[condition.trim().toLowerCase()] ?? condition.trim();
}

function knownFactBlob(facts: ChannelDescriptionFacts): string {
  return [facts.title, facts.condition, ...facts.attributes.map((entry) => entry.value ?? '')]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
    .toLowerCase();
}

/** Tokens der Lückenanalyse, die in den bekannten Fakten schon vorkommen. */
export function knownGapTokens(facts: ChannelDescriptionFacts): string[] {
  const blob = knownFactBlob(facts);
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of facts.missingTokens) {
    const normalized = token.trim().toLowerCase();
    if (normalized.length < 3 || seen.has(normalized)) continue;
    if (!blob.includes(normalized)) continue;
    seen.add(normalized);
    tokens.push(normalized);
  }
  return tokens;
}

function searchableLead(facts: ChannelDescriptionFacts): string {
  const gaps = knownGapTokens(facts);
  const parts = [
    attribute(facts, 'brand'),
    attribute(facts, 'category') ?? facts.title,
    attribute(facts, 'color'),
    attribute(facts, 'size') ? `Größe ${attribute(facts, 'size')}` : null,
    attribute(facts, 'material'),
    ...gaps,
  ].filter((part): part is string => Boolean(part));
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }
  return unique.join(' · ');
}

function includedLabel(facts: ChannelDescriptionFacts): string {
  return attribute(facts, 'included') ?? 'der Artikel selbst';
}

/**
 * Portal-Text aus bestätigten Fakten. Keine erfundenen Maße, keine PLZ,
 * keine Floskeln. Fehlende Pflichtangaben bleiben als Platzhalter, den
 * der Mensch auf der Karte ausfüllt.
 */
export function buildChannelDescription(
  channel: ListingChannel,
  facts: ChannelDescriptionFacts,
): string {
  const condition = conditionLabel(facts.condition);
  const brand = attribute(facts, 'brand');
  const category = attribute(facts, 'category');
  const color = attribute(facts, 'color');
  const size = attribute(facts, 'size');
  const material = attribute(facts, 'material');
  const measurements = attribute(facts, 'measurements');
  const lead = searchableLead(facts);
  const title = facts.title?.trim() || 'Artikel';

  if (channel === 'KLEINANZEIGEN') {
    const factsLine = [brand, category, color, material, size ? `Größe ${size}` : null]
      .filter((part): part is string => Boolean(part))
      .join(', ');
    const lines = [title];
    if (factsLine) lines.push('', `${factsLine}.`);
    const gaps = knownGapTokens(facts).filter((token) => !lines.join('\n').toLowerCase().includes(token));
    if (gaps.length > 0) lines.push(gaps.join(', ') + '.');
    lines.push('', `Zustand: ${condition}.`, '', 'Du kannst den Artikel abholen. PLZ: (bitte eintragen).');
    return lines.join('\n');
  }

  if (channel === 'EBAY') {
    const lines = [lead || title, '', `Zustand: ${condition}.`, `Lieferumfang: ${includedLabel(facts)}.`];
    return lines.join('\n');
  }

  const vintedParts = [
    brand ?? 'Marke: (bitte eintragen)',
    category ?? title,
    color ? `Farbe ${color}` : 'Farbe: (bitte eintragen)',
    size ? `Größe ${size}` : 'Größe: (bitte eintragen)',
  ];
  const measure = measurements ?? '(bitte eintragen)';
  return `${vintedParts.join(', ')}. Maße: ${measure}. Zustand: ${condition}.`;
}

/**
 * Hängt die kanalspezifischen Pflichtzeilen an einen Modelltext, ohne
 * Fakten zu erfinden. Ist der Modelltext leer, gilt die Vorlage.
 */
export function finalizeChannelDescription(
  channel: ListingChannel,
  generated: string | null,
  facts: ChannelDescriptionFacts,
): string {
  const template = buildChannelDescription(channel, facts);
  const text = generated?.trim();
  if (!text) return template;

  let result = text;
  for (const token of knownGapTokens(facts)) {
    if (!result.toLowerCase().includes(token)) {
      result = `${result}\n${token}`;
    }
  }

  if (channel === 'KLEINANZEIGEN') {
    if (!/abhol/i.test(result)) result += '\nDu kannst den Artikel abholen.';
    if (!/\bplz\b/i.test(result)) result += '\nPLZ: (bitte eintragen).';
  } else if (channel === 'EBAY') {
    const lead = searchableLead(facts);
    if (lead && !result.toLowerCase().includes(lead.toLowerCase())) {
      result = `${lead}\n\n${result}`;
    }
    if (!/zustand/i.test(result)) result += `\nZustand: ${conditionLabel(facts.condition)}.`;
    if (!/lieferumfang/i.test(result)) result += `\nLieferumfang: ${includedLabel(facts)}.`;
  } else if (!/maße|masse/i.test(result) || !/größe|groesse/i.test(result) || !/farbe/i.test(result)) {
    result = `${template}`;
  }

  return result.trim();
}
