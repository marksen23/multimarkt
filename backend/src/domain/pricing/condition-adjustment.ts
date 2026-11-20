export type PriceCondition = 'new' | 'like_new' | 'good' | 'fair' | 'defective';

/**
 * Die eBay-Suche mischt alle gebrauchten Zustände (3000–6000).
 * Der Faktor setzt den eigenen Zustand einmal dagegen, relativ zu „Gut“.
 * Er wird nicht noch einmal auf einen bereits zustandsgefilterten Median gelegt.
 */
export const CONDITION_PRICE_FACTORS: Record<PriceCondition, number> = {
  new: 1.12,
  like_new: 1.06,
  good: 1,
  fair: 0.88,
  defective: 0.6,
};

const CONDITION_NOTES: Record<PriceCondition, string> = {
  new: 'Zustand Neu: die Vergleichsangebote sind meist gebraucht, deshalb +12 %.',
  like_new: 'Zustand Wie neu: +6 % gegenüber dem Mix gebrauchter Angebote.',
  good: 'Zustand Gut: kein Auf- oder Abschlag.',
  fair: 'Zustand Gebraucht mit Spuren: −12 %.',
  defective: 'Zustand Defekt: −40 %. Defekte Angebote bleiben drin, neuwertige fallen raus.',
};

const EXACT: Record<string, PriceCondition> = {
  neu: 'new',
  new: 'new',
  ovp: 'new',
  'wie neu': 'like_new',
  'like new': 'like_new',
  neuwertig: 'like_new',
  'sehr gut': 'like_new',
  unbenutzt: 'like_new',
  gut: 'good',
  good: 'good',
  gebraucht: 'fair',
  fair: 'fair',
  abgenutzt: 'fair',
  defekt: 'defective',
  defective: 'defective',
  kaputt: 'defective',
};

export function priceConditionKey(value: string | null | undefined): PriceCondition | null {
  if (!value?.trim()) return null;
  const folded = value.trim().toLocaleLowerCase('de-DE').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return EXACT[folded] ?? null;
}

export function conditionAdjustment(value: string | null | undefined): {
  key: PriceCondition | null;
  factor: number;
  note: string;
} {
  const key = priceConditionKey(value);
  if (!key) {
    return {
      key: null,
      factor: 1,
      note: 'Zustand ist nicht bestätigt, deshalb kein Auf- oder Abschlag.',
    };
  }
  return { key, factor: CONDITION_PRICE_FACTORS[key], note: CONDITION_NOTES[key] };
}
