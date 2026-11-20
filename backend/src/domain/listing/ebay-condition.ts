/**
 * Zustand der Oberfläche → ConditionEnum der Sell Inventory API und die
 * passende Condition-ID. Unklare Freitexte werden nicht geraten.
 *
 * IDs nach eBay Condition ID Values (EBAY_DE):
 * 1000 Neu, 2750 Neuwertig, 3000 Gebraucht, 4000 Sehr gut,
 * 5000 Gut, 6000 Akzeptabel, 7000 Defekt.
 */
export interface EbayConditionMapping {
  code: string;
  conditionId: string;
  label: string;
}

const EXACT: Record<string, EbayConditionMapping> = {
  neu: { code: 'NEW', conditionId: '1000', label: 'Neu' },
  'wie neu': { code: 'LIKE_NEW', conditionId: '2750', label: 'Neuwertig' },
  gut: { code: 'USED_GOOD', conditionId: '5000', label: 'Gut' },
  gebraucht: { code: 'USED_ACCEPTABLE', conditionId: '6000', label: 'Akzeptabel' },
  defekt: { code: 'FOR_PARTS_OR_NOT_WORKING', conditionId: '7000', label: 'Defekt' },
};

const PHRASES: { includes: string; mapping: EbayConditionMapping }[] = [
  {
    includes: 'defekt',
    mapping: EXACT.defekt,
  },
  {
    includes: 'kaputt',
    mapping: EXACT.defekt,
  },
  {
    includes: 'wie neu',
    mapping: EXACT['wie neu'],
  },
  {
    includes: 'neuwertig',
    mapping: EXACT['wie neu'],
  },
  {
    includes: 'sehr gut',
    mapping: { code: 'USED_VERY_GOOD', conditionId: '4000', label: 'Sehr gut' },
  },
  {
    includes: 'gebraucht',
    mapping: EXACT.gebraucht,
  },
  {
    includes: 'gut',
    mapping: EXACT.gut,
  },
];

export function mapConditionToEbay(condition: string | null | undefined): EbayConditionMapping | null {
  const text = (condition ?? '').trim().toLowerCase();
  if (!text) return null;
  if (EXACT[text]) return EXACT[text];
  if (text === 'new') return EXACT.neu;
  for (const phrase of PHRASES) {
    if (text.includes(phrase.includes)) return phrase.mapping;
  }
  return null;
}
