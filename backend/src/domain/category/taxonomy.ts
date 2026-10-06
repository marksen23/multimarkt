/**
 * Kleine eigene Taxonomie (Feature-Plan 3.9). Bewusst keine eBay- oder
 * Vinted-Kategoriebäume — nur die Brücke, die zum Ausfüllen reicht.
 *
 * Pflichtangaben hängen an der Kategorie. Was eine Kategorie nicht
 * braucht (Größe bei einem Buch, Funktion bei einem Sofa), wird nicht
 * verlangt.
 */

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

export const FACT_KEYS = ['size', 'measurements', 'brand', 'functionChecked'] as const;

export type FactKey = (typeof FACT_KEYS)[number];

/**
 * Nur die Angaben, die diese Kategorie wirklich braucht.
 * Größe und Marke für tragbare Ware, Maße für Dinge mit Stellfläche,
 * Funktion geprüft für Geräte. Medien und Sonstiges haben keine davon.
 */
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

const KEY_ALIASES: Record<string, string> = {
  category: 'category',
  kategorie: 'category',
  categorydetail: 'categoryDetail',
  producttype: 'categoryDetail',
  artikelart: 'categoryDetail',
  size: 'size',
  groesse: 'size',
  brand: 'brand',
  marke: 'brand',
  measurements: 'measurements',
  masse: 'measurements',
  abmessungen: 'measurements',
  functionchecked: 'functionChecked',
  funktion: 'functionChecked',
  funktiongeprueft: 'functionChecked',
  color: 'color',
  farbe: 'color',
  material: 'material',
  condition: 'condition',
  zustand: 'condition',
};

/**
 * Spezifische Wörter zuerst. "Handschuh" endet auf "schuh", ist aber
 * Kleidung. Kurze, mehrdeutige Tokens ("mode", "boot" in "Bootstrap")
 * stehen hier bewusst nicht.
 */
const CATEGORY_KEYWORDS: { category: ResaleCategory; words: string[] }[] = [
  { category: 'Kleidung', words: ['handschuh', 'handschuhe'] },
  {
    category: 'Schuhe',
    words: [
      'schuh',
      'schuhe',
      'sneaker',
      'stiefel',
      'sandale',
      'sandalen',
      'turnschuh',
      'pumps',
      'shoe',
      'shoes',
    ],
  },
  {
    category: 'Elektronik',
    words: [
      'elektronik',
      'electronic',
      'electronics',
      'handy',
      'smartphone',
      'phone',
      'laptop',
      'computer',
      'kopfhoerer',
      'kamera',
      'konsole',
      'tablet',
      'fernseher',
      'staubsauger',
      'drucker',
    ],
  },
  {
    category: 'Medien',
    words: [
      'medien',
      'media',
      'buch',
      'buecher',
      'book',
      'books',
      'dvd',
      'vinyl',
      'bluray',
      'zeitschrift',
      'comic',
      'videospiel',
      'cd',
    ],
  },
  {
    category: 'Möbel',
    words: [
      'moebel',
      'furniture',
      'sofa',
      'schrank',
      'tisch',
      'stuhl',
      'regal',
      'bett',
      'kommode',
      'sessel',
      'couch',
    ],
  },
  {
    category: 'Haushalt',
    words: ['haushalt', 'household', 'kueche', 'geschirr', 'lampe', 'topf', 'pfanne', 'waesche'],
  },
  {
    category: 'Kleidung',
    words: [
      'kleidung',
      'bekleidung',
      'jacke',
      'jacken',
      'pullover',
      'hose',
      'hemd',
      'shirt',
      'bluse',
      'mantel',
      'rock',
      'jeans',
      'weste',
      'strick',
      'kleid',
      'fashion',
      'clothing',
      'clothes',
    ],
  },
];

export function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

export function canonicalAttributeKey(raw: string): string | null {
  const folded = fold(raw).replace(/[^a-z0-9]+/g, '');
  return KEY_ALIASES[folded] ?? null;
}

export function canonicalCategory(value: string | null | undefined): ResaleCategory | null {
  if (!value?.trim()) return null;
  const folded = value.trim().toLowerCase();
  return RESALE_CATEGORIES.find((category) => category.toLowerCase() === folded) ?? null;
}

/** Freitext ("Sneaker", "Bekleidung > Herren > Jacken") auf die Taxonomie. */
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

export function requiredFactsFor(category: ResaleCategory): readonly FactKey[] {
  return CATEGORY_REQUIRED_FACTS[category];
}

/** Ankauf lohnt sich bei Geräten und Medien, nicht bei Kleidung oder Möbeln. */
export function prefersBuyback(category: string | null | undefined): boolean {
  const resolved = resolveCategory(category);
  return resolved === 'Elektronik' || resolved === 'Medien';
}

export function normalizeFunctionChecked(value: string | null | undefined): 'ja' | 'nein' | null {
  if (!value?.trim()) return null;
  const folded = fold(value);
  if (folded === 'ja' || folded === 'yes' || folded === 'true') return 'ja';
  if (folded === 'nein' || folded === 'no' || folded === 'false') return 'nein';
  return null;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeConfirmedValue(key: string, value: string | null | undefined): string | null {
  const canonical = canonicalAttributeKey(key);
  if (!canonical) return blankToNull(value);
  if (canonical === 'category') return canonicalCategory(value);
  if (canonical === 'functionChecked') return normalizeFunctionChecked(value);
  return blankToNull(value);
}

export interface VisionClaim {
  key: string;
  value: string | null;
  confidence: number;
}

/**
 * Bildanalyse darf nur schreiben, was sie sieht. Die Kategorie wird auf die
 * Taxonomie gelegt. Pflichtangaben ohne sichtbaren Wert werden als Lücke
 * (value null) ausgegeben, aber nur für die erkannte Kategorie.
 */
export function projectVisionClaims(raw: VisionClaim[]): VisionClaim[] {
  const seen = new Map<string, VisionClaim>();
  for (const claim of raw) {
    const key = canonicalAttributeKey(claim.key);
    if (!key) continue;
    const value =
      key === 'functionChecked' ? normalizeFunctionChecked(claim.value) : blankToNull(claim.value);
    const previous = seen.get(key);
    if (!previous || (previous.value == null && value)) {
      seen.set(key, { key, value, confidence: claim.confidence });
    }
  }

  const rawCategory = seen.get('category')?.value ?? null;
  const resolved = resolveCategory(rawCategory);
  const explicitDetail = seen.get('categoryDetail')?.value ?? null;
  const categoryConfidence = seen.get('category')?.confidence ?? 0;

  if (resolved) {
    seen.set('category', { key: 'category', value: resolved, confidence: categoryConfidence });
    if (rawCategory && !canonicalCategory(rawCategory) && !explicitDetail) {
      seen.set('categoryDetail', {
        key: 'categoryDetail',
        value: rawCategory,
        confidence: categoryConfidence,
      });
    }
  } else {
    if (rawCategory && !explicitDetail) {
      seen.set('categoryDetail', {
        key: 'categoryDetail',
        value: rawCategory,
        confidence: categoryConfidence,
      });
    }
    seen.set('category', { key: 'category', value: null, confidence: 0 });
  }

  const category = canonicalCategory(seen.get('category')?.value ?? null);
  const projected: VisionClaim[] = [seen.get('category')!];

  const detail = seen.get('categoryDetail');
  if (detail?.value) projected.push(detail);

  for (const key of ['color', 'material', 'condition', ...FACT_KEYS]) {
    const claim = seen.get(key);
    if (claim?.value) projected.push(claim);
  }

  if (category) {
    for (const fact of CATEGORY_REQUIRED_FACTS[category]) {
      if (!seen.get(fact)?.value) {
        projected.push({ key: fact, value: null, confidence: 0 });
      }
    }
  }

  return projected;
}

export function isWritableAttributeKey(key: string): boolean {
  const canonical = canonicalAttributeKey(key);
  return (
    canonical === 'category' ||
    canonical === 'categoryDetail' ||
    canonical === 'color' ||
    canonical === 'material' ||
    canonical === 'condition' ||
    (FACT_KEYS as readonly string[]).includes(canonical ?? '')
  );
}
