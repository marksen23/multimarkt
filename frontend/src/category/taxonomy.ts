// Spiegelt backend/src/domain/category/taxonomy.ts. Frontend und Backend
// sind getrennte Projekte ohne Shared-Package.

export const RESALE_CATEGORIES = [
  'Kleidung',
  'Schuhe',
  'Elektronik',
  'Medien',
  'Haushalt',
  'Möbel',
  'Sonstiges',
] as const;

export type ResaleCategory = (typeof RESALE_CATEGORIES)[number];

export type FactKey = 'size' | 'measurements' | 'brand' | 'functionChecked';

export const CATEGORY_REQUIRED_FACTS: Record<ResaleCategory, readonly FactKey[]> = {
  Kleidung: ['size', 'brand'],
  Schuhe: ['size', 'brand'],
  Elektronik: ['brand', 'functionChecked'],
  Medien: [],
  Haushalt: ['measurements'],
  Möbel: ['measurements'],
  Sonstiges: [],
};

export const ATTRIBUTE_LABELS: Record<string, string> = {
  category: 'Kategorie',
  categoryDetail: 'Artikelart',
  size: 'Größe',
  measurements: 'Maße',
  brand: 'Marke',
  functionChecked: 'Funktion geprüft',
  color: 'Farbe',
  material: 'Material',
  condition: 'Zustand',
};

const CATEGORY_KEYWORDS: { category: ResaleCategory; words: string[] }[] = [
  { category: 'Kleidung', words: ['handschuh', 'handschuhe'] },
  { category: 'Schuhe', words: ['schuh', 'schuhe', 'sneaker', 'stiefel', 'sandale', 'turnschuh', 'shoe', 'shoes'] },
  {
    category: 'Elektronik',
    words: ['elektronik', 'electronic', 'electronics', 'handy', 'smartphone', 'laptop', 'computer', 'kamera', 'phone'],
  },
  { category: 'Medien', words: ['medien', 'media', 'buch', 'buecher', 'book', 'books', 'dvd', 'vinyl', 'cd'] },
  { category: 'Möbel', words: ['moebel', 'furniture', 'sofa', 'schrank', 'tisch', 'stuhl', 'regal', 'bett', 'kommode'] },
  { category: 'Haushalt', words: ['haushalt', 'household', 'kueche', 'geschirr', 'lampe'] },
  {
    category: 'Kleidung',
    words: ['kleidung', 'bekleidung', 'jacke', 'jacken', 'pullover', 'hose', 'hemd', 'shirt', 'fashion', 'clothing'],
  },
];

function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

export function attributeLabel(key: string): string {
  return ATTRIBUTE_LABELS[key] ?? key;
}

export function displayAttributeValue(key: string, value: string | null): string {
  if (!value) return '—';
  if (key === 'functionChecked' && value === 'ja') return 'Ja';
  if (key === 'functionChecked' && value === 'nein') return 'Nein';
  return value;
}

export function canonicalCategory(value: string | null | undefined): ResaleCategory | null {
  if (!value?.trim()) return null;
  const folded = value.trim().toLowerCase();
  return RESALE_CATEGORIES.find((category) => category.toLowerCase() === folded) ?? null;
}

export function resolveCategory(value: string | null | undefined): ResaleCategory | null {
  const exact = canonicalCategory(value);
  if (exact) return exact;
  if (!value?.trim()) return null;
  const tokens = fold(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const hit = (word: string) => tokens.some((token) => token === word || token.endsWith(word));
  for (const rule of CATEGORY_KEYWORDS) {
    if (rule.words.some(hit)) return rule.category;
  }
  return null;
}

export interface GapAttribute {
  attributeKey: string;
  attributeValue: string | null;
  truthState: string;
}

/** Lücken: Kategorie, solange sie fehlt, danach nur die Pflichtangaben dieser Kategorie. */
export function categoryGaps(attributes: GapAttribute[]): string[] {
  const categoryAttr = attributes.find((attribute) => attribute.attributeKey === 'category');
  const category = canonicalCategory(categoryAttr?.attributeValue);
  if (!category || categoryAttr?.truthState === 'UNKNOWN') return ['category'];

  return CATEGORY_REQUIRED_FACTS[category].filter((fact) => {
    const attr = attributes.find((attribute) => attribute.attributeKey === fact);
    return !attr || attr.truthState === 'UNKNOWN' || !attr.attributeValue;
  });
}
