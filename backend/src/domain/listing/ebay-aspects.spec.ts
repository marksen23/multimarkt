import { fillEbayAspects } from './ebay-aspects';

describe('fillEbayAspects', () => {
  const definitions = [
    { name: 'Marke', required: true },
    { name: 'Farbe', required: false },
    { name: 'Schuhgröße', required: true },
    { name: 'US-Schuhgröße', required: true },
  ];

  it('fills known specifics and reports the ones the analysis does not have', () => {
    const filled = fillEbayAspects({
      definitions,
      attributes: { brand: 'Nike', size: '42', color: '' },
      brandFallback: null,
    });
    expect(filled.aspects).toEqual({ Marke: ['Nike'], Schuhgröße: ['42'] });
    expect(filled.missing).toEqual(['US-Schuhgröße']);
  });

  it('uses the projection brand fallback only for a required brand aspect', () => {
    const filled = fillEbayAspects({
      definitions: [{ name: 'Marke', required: true }],
      attributes: {},
      brandFallback: 'Markenlos / Sonstige',
    });
    expect(filled.aspects).toEqual({ Marke: ['Markenlos / Sonstige'] });
    expect(filled.missing).toEqual([]);
  });
});
