import {
  pickMarketSalePrice,
  suggestBundles,
  type BundleSuggestionCandidate,
} from './bundle-suggestions';

function sweater(
  id: string,
  overrides: Partial<BundleSuggestionCandidate> & {
    size?: string;
    category?: string;
    brand?: string;
  } = {},
): BundleSuggestionCandidate {
  const {
    size = '98',
    category = 'Kinderpullover',
    brand,
    ...rest
  } = overrides;
  const attributes = [
    { key: 'category', value: category },
    { key: 'size', value: size },
  ];
  if (brand !== undefined) attributes.push({ key: 'brand', value: brand });
  return {
    id,
    title: `Pullover ${id}`,
    salePriceEur: 6,
    purchasePriceEur: 1,
    singleShippingEur: 4.49,
    attributes,
    ...rest,
  };
}

const assumptions = {
  feePercent: 0,
  singleSaleThresholdEur: 5,
  dismissedFingerprints: [] as string[],
};

describe('suggestBundles', () => {
  it('offers children’s sweaters that share a size as a pickup bundle', () => {
    const result = suggestBundles({
      ...assumptions,
      items: ['a', 'b', 'c', 'd', 'e'].map((id) => sweater(id)),
    });

    expect(result.suggestions).toHaveLength(1);
    const suggestion = result.suggestions[0];
    expect(suggestion.dimension).toBe('size');
    expect(suggestion.matchValue).toBe('98');
    expect(suggestion.title).toBe(
      'Kinderpullover Größe 98 (5 Teile), nur Abholung',
    );
    expect(suggestion.suggestedPriceEur).toBe(30);
    expect(suggestion.bundleMarginEur).toBe(25);
    expect(suggestion.items.every((item) => item.marginEur < 5)).toBe(true);
    expect(suggestion.description).toContain('Abholpaket');
    expect(suggestion.description).toContain('Versand');
    expect(suggestion.itemIds).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('groups by category or brand text without a taxonomy', () => {
    const byCategory = suggestBundles({
      ...assumptions,
      items: [
        sweater('a', {
          size: '98',
          category: 'Bekleidung > Kinder > Pullover',
        }),
        sweater('b', {
          size: '104',
          category: 'Bekleidung > Kinder > Pullover',
        }),
        sweater('c', { size: '110', category: 'Pullover' }),
      ],
    });
    expect(
      byCategory.suggestions.map((suggestion) => suggestion.matchValue),
    ).toEqual(['Bekleidung > Kinder > Pullover']);

    const byBrand = suggestBundles({
      ...assumptions,
      items: [
        sweater('a', { size: '98', brand: 'H&M' }),
        sweater('b', { size: '104', brand: 'h&m' }),
        sweater('c', { size: '110', brand: 'C&A' }),
      ],
    });
    expect(byBrand.suggestions).toHaveLength(1);
    expect(byBrand.suggestions[0].dimension).toBe('brand');
    expect(byBrand.suggestions[0].matchValue).toBe('H&M');
  });

  it('reads the Größe key the same way as size', () => {
    const result = suggestBundles({
      ...assumptions,
      items: [
        {
          ...sweater('a', { size: '' }),
          attributes: [
            { key: 'category', value: 'Kinderpullover' },
            { key: 'Größe', value: '98' },
          ],
        },
        {
          ...sweater('b', { size: '' }),
          attributes: [
            { key: 'category', value: 'Kinderpullover' },
            { key: 'groesse', value: '98' },
          ],
        },
      ],
    });

    expect(result.suggestions[0]?.dimension).toBe('size');
    expect(result.suggestions[0]?.itemIds).toEqual(['a', 'b']);
  });

  it('keeps the size package and does not also offer the same pieces by brand', () => {
    const result = suggestBundles({
      ...assumptions,
      items: [
        sweater('a', { brand: 'H&M' }),
        sweater('b', { brand: 'H&M' }),
        sweater('c', { brand: 'C&A' }),
      ],
    });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].dimension).toBe('size');
    expect(result.suggestions[0].itemIds).toEqual(['a', 'b', 'c']);
  });

  it('offers two size packages when the sizes differ', () => {
    const result = suggestBundles({
      ...assumptions,
      items: [
        sweater('a'),
        sweater('b'),
        sweater('c', { size: '104' }),
        sweater('d', { size: '104' }),
      ],
    });

    expect(
      result.suggestions.map((suggestion) => suggestion.matchValue).sort(),
    ).toEqual(['104', '98']);
  });

  it('skips a single item, items at the threshold, and items without Einstand', () => {
    const result = suggestBundles({
      ...assumptions,
      items: [
        sweater('alone'),
        sweater('at', {
          salePriceEur: 10,
          singleShippingEur: 0,
          purchasePriceEur: 5,
        }),
        sweater('no-purchase', { purchasePriceEur: null }),
        sweater('unknown-size', { size: 'Unbekannt', category: 'Andere' }),
      ],
    });

    expect(result.suggestions).toEqual([]);
  });

  it('does not suggest a package that stays under the threshold even as pickup', () => {
    const result = suggestBundles({
      ...assumptions,
      items: [
        sweater('a', { salePriceEur: 3, purchasePriceEur: 2.5 }),
        sweater('b', { salePriceEur: 3, purchasePriceEur: 2.5 }),
      ],
    });

    expect(result.suggestions).toEqual([]);
  });

  it('returns nothing until the user has set a threshold', () => {
    const result = suggestBundles({
      feePercent: 0,
      singleSaleThresholdEur: null,
      dismissedFingerprints: [],
      items: [sweater('a'), sweater('b')],
    });

    expect(result).toEqual({ thresholdEur: null, suggestions: [] });
  });

  it('hides a dismissed fingerprint and does not reoffer those pieces by category', () => {
    const first = suggestBundles({
      ...assumptions,
      items: [sweater('a'), sweater('b')],
    });
    const fingerprint = first.suggestions[0].fingerprint;

    const second = suggestBundles({
      ...assumptions,
      dismissedFingerprints: [fingerprint],
      items: [sweater('a'), sweater('b')],
    });

    expect(second.suggestions).toEqual([]);
  });

  it('applies the fee once to the pickup price', () => {
    const result = suggestBundles({
      feePercent: 10,
      singleSaleThresholdEur: 5,
      dismissedFingerprints: [],
      items: [
        sweater('a', {
          salePriceEur: 10,
          purchasePriceEur: 1,
          singleShippingEur: 6,
        }),
        sweater('b', {
          salePriceEur: 10,
          purchasePriceEur: 1,
          singleShippingEur: 6,
        }),
      ],
    });

    expect(result.suggestions[0].suggestedPriceEur).toBe(20);
    expect(result.suggestions[0].bundleNetEur).toBe(18);
    expect(result.suggestions[0].bundleMarginEur).toBe(16);
  });
});

describe('pickMarketSalePrice', () => {
  it('uses the newest market sample with the larger sample size and ignores the buyback anchor', () => {
    const price = pickMarketSalePrice([
      { source: 'ANKAUF_PORTAL', median: 40, sampleSize: 1, fetchedAtMs: 300 },
      {
        source: 'EBAY_ACTIVE_LISTINGS',
        median: 34,
        sampleSize: 8,
        fetchedAtMs: 100,
      },
      {
        source: 'EBAY_ACTIVE_LISTINGS',
        median: 6,
        sampleSize: 9,
        fetchedAtMs: 200,
      },
      {
        source: 'GEMINI_GROUNDING',
        median: 7,
        sampleSize: 5,
        fetchedAtMs: 200,
      },
    ]);

    expect(price).toBe(6);
  });

  it('returns null when only a buyback anchor is stored', () => {
    expect(
      pickMarketSalePrice([
        { source: 'ANKAUF_PORTAL', median: 12, sampleSize: 1, fetchedAtMs: 1 },
      ]),
    ).toBeNull();
  });
});
