/**
 * Logistikprofil eines Artikels (Feature-Plan 3.5).
 * Ersetzt die Ja/Nein-Sperrig-Flagge der Disposition und die pauschalen
 * 1,50 € Versandabzug. Die Beträge sind Annahmen, keine Live-Tarife.
 */

export interface LogisticsProfile {
  captured: boolean;
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  bulky: boolean;
  pickupOnly: boolean;
  shippingPossible: boolean;
  postalCode: string | null;
}

export const EMPTY_LOGISTICS: LogisticsProfile = {
  captured: false,
  weightGrams: null,
  lengthCm: null,
  widthCm: null,
  heightCm: null,
  bulky: false,
  pickupOnly: false,
  shippingPossible: false,
  postalCode: null,
};

/** Versandportale. Kleinanzeigen bleibt auch bei reiner Abholung. */
export const SHIPPING_PORTAL_KEYS = ['EBAY', 'VINTED'] as const;

/** Paketgrenze, ab der kein Versandportal mehr passt (Sofa, Spedition). */
const PARCEL_MAX_WEIGHT_GRAMS = 31_500;
const PARCEL_MAX_LONGEST_CM = 120;
const PARCEL_MAX_GIRTH_CM = 300;

/**
 * Annahmen statt der alten Pauschale von 1,50 €.
 * Erste passende Zeile gewinnt: Gewicht und längste Seite.
 */
const PARCEL_SHIPPING_BANDS: { maxWeightGrams: number; maxLongestCm: number; eur: number }[] = [
  { maxWeightGrams: 500, maxLongestCm: 35, eur: 1.95 },
  { maxWeightGrams: 2000, maxLongestCm: 60, eur: 4.49 },
  { maxWeightGrams: 5000, maxLongestCm: 120, eur: 6.19 },
  { maxWeightGrams: 10_000, maxLongestCm: 120, eur: 8.49 },
  { maxWeightGrams: PARCEL_MAX_WEIGHT_GRAMS, maxLongestCm: PARCEL_MAX_LONGEST_CM, eur: 14.99 },
];

/** Wenn Versand möglich ist, aber Gewicht und Maße fehlen. Nicht 1,50 €. */
const UNKNOWN_PARCEL_SHIPPING_EUR = 4.49;

export function toLogisticsProfile(source: {
  logisticsCaptured?: boolean;
  weightGrams?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  logisticsBulky?: boolean;
  pickupOnly?: boolean;
  shippingPossible?: boolean;
  postalCode?: string | null;
}): LogisticsProfile {
  return {
    captured: source.logisticsCaptured ?? false,
    weightGrams: source.weightGrams ?? null,
    lengthCm: source.lengthCm ?? null,
    widthCm: source.widthCm ?? null,
    heightCm: source.heightCm ?? null,
    bulky: source.logisticsBulky ?? false,
    pickupOnly: source.pickupOnly ?? false,
    shippingPossible: source.shippingPossible ?? false,
    postalCode: source.postalCode ?? null,
  };
}

export function longestSideCm(profile: LogisticsProfile): number | null {
  const sides = [profile.lengthCm, profile.widthCm, profile.heightCm].filter(
    (side): side is number => side != null && side > 0,
  );
  if (sides.length === 0) return null;
  return Math.max(...sides);
}

/** DHL-Gurtmaß: längste Seite + 2 × die beiden anderen. */
export function girthCm(profile: LogisticsProfile): number | null {
  const { lengthCm, widthCm, heightCm } = profile;
  if (lengthCm == null || widthCm == null || heightCm == null) return null;
  const [longest, second, third] = [lengthCm, widthCm, heightCm].sort((a, b) => b - a);
  return longest + 2 * second + 2 * third;
}

export function exceedsParcelLimit(profile: LogisticsProfile): boolean {
  if (profile.weightGrams != null && profile.weightGrams > PARCEL_MAX_WEIGHT_GRAMS) return true;
  const longest = longestSideCm(profile);
  if (longest != null && longest > PARCEL_MAX_LONGEST_CM) return true;
  const girth = girthCm(profile);
  if (girth != null && girth > PARCEL_MAX_GIRTH_CM) return true;
  return false;
}

/**
 * eBay und Vinted nur, wenn das Profil Versand erlaubt und der Artikel
 * als Paket durchgeht. Sperrig, Nur-Abholung oder ein Sofa (Maße/Gewicht)
 * schließen die Versandportale aus.
 */
export function shippingPortalsAllowed(profile: LogisticsProfile): boolean {
  if (!profile.captured) return false;
  if (profile.bulky || profile.pickupOnly || !profile.shippingPossible) return false;
  if (exceedsParcelLimit(profile)) return false;
  return true;
}

export function shippingCostEur(profile: LogisticsProfile): number {
  if (!shippingPortalsAllowed(profile)) return 0;

  const weight = profile.weightGrams;
  const longest = longestSideCm(profile);
  if (weight == null && longest == null) return UNKNOWN_PARCEL_SHIPPING_EUR;

  const weightGrams = weight ?? 0;
  const longestCm = longest ?? 0;
  const band = PARCEL_SHIPPING_BANDS.find(
    (entry) => weightGrams <= entry.maxWeightGrams && longestCm <= entry.maxLongestCm,
  );
  return band?.eur ?? PARCEL_SHIPPING_BANDS[PARCEL_SHIPPING_BANDS.length - 1].eur;
}
