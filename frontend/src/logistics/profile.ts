// Spiegelt backend/src/domain/logistics/logistics-profile.ts.
// Dieselben Grenzen und Paketbänder, damit Angebotspaket und Formular
// dieselbe Abholung-oder-Versand-Entscheidung zeigen wie die Disposition.

import type { Item } from '../api/types';

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

export interface LogisticsDraft {
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  bulky: boolean;
  pickupOnly: boolean;
  shippingPossible: boolean;
  postalCode: string | null;
}

const PARCEL_MAX_WEIGHT_GRAMS = 31_500;
const PARCEL_MAX_LONGEST_CM = 120;
const PARCEL_MAX_GIRTH_CM = 300;

const PARCEL_SHIPPING_BANDS: { maxWeightGrams: number; maxLongestCm: number; eur: number }[] = [
  { maxWeightGrams: 500, maxLongestCm: 35, eur: 1.95 },
  { maxWeightGrams: 2000, maxLongestCm: 60, eur: 4.49 },
  { maxWeightGrams: 5000, maxLongestCm: 120, eur: 6.19 },
  { maxWeightGrams: 10_000, maxLongestCm: 120, eur: 8.49 },
  { maxWeightGrams: PARCEL_MAX_WEIGHT_GRAMS, maxLongestCm: PARCEL_MAX_LONGEST_CM, eur: 14.99 },
];

const UNKNOWN_PARCEL_SHIPPING_EUR = 4.49;

export function toLogisticsProfile(item: Item): LogisticsProfile {
  return {
    captured: item.logisticsCaptured,
    weightGrams: item.weightGrams,
    lengthCm: item.lengthCm,
    widthCm: item.widthCm,
    heightCm: item.heightCm,
    bulky: item.logisticsBulky,
    pickupOnly: item.pickupOnly,
    shippingPossible: item.shippingPossible,
    postalCode: item.postalCode,
  };
}

export function shippingPortalsAllowed(profile: LogisticsProfile): boolean {
  if (!profile.captured) return false;
  if (profile.bulky || profile.pickupOnly || !profile.shippingPossible) return false;
  if (exceedsParcelLimit(profile)) return false;
  return true;
}

export function shippingCostEur(profile: LogisticsProfile): number {
  if (!shippingPortalsAllowed(profile)) return 0;
  const longest = longestSideCm(profile);
  if (profile.weightGrams == null && longest == null) return UNKNOWN_PARCEL_SHIPPING_EUR;
  const weightGrams = profile.weightGrams ?? 0;
  const longestCm = longest ?? 0;
  const band = PARCEL_SHIPPING_BANDS.find(
    (entry) => weightGrams <= entry.maxWeightGrams && longestCm <= entry.maxLongestCm,
  );
  return band?.eur ?? PARCEL_SHIPPING_BANDS[PARCEL_SHIPPING_BANDS.length - 1].eur;
}

function longestSideCm(profile: LogisticsProfile): number | null {
  const sides = [profile.lengthCm, profile.widthCm, profile.heightCm].filter(
    (side): side is number => side != null && side > 0,
  );
  if (sides.length === 0) return null;
  return Math.max(...sides);
}

function exceedsParcelLimit(profile: LogisticsProfile): boolean {
  if (profile.weightGrams != null && profile.weightGrams > PARCEL_MAX_WEIGHT_GRAMS) return true;
  const longest = longestSideCm(profile);
  if (longest != null && longest > PARCEL_MAX_LONGEST_CM) return true;
  const { lengthCm, widthCm, heightCm } = profile;
  if (lengthCm == null || widthCm == null || heightCm == null) return false;
  const [first, second, third] = [lengthCm, widthCm, heightCm].sort((a, b) => b - a);
  return first + 2 * second + 2 * third > PARCEL_MAX_GIRTH_CM;
}
