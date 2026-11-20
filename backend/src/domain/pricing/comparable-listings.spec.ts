import { selectComparableListings } from './comparable-listings';
import { ComparableListing } from './market-distribution-provider.interface';

const bosch: ComparableListing[] = [
  { title: 'Bosch GBH 2-28 F Bohrhammer gebraucht', price: 84.99, currency: 'EUR' },
  { title: 'Bosch GBH 2-28 F sehr gut mit Koffer', price: 95, currency: 'EUR' },
  { title: 'Bosch Professional GBH 2-28 F', price: 110, currency: 'EUR' },
  { title: 'Koffer für Bosch GBH 2-28', price: 25, currency: 'EUR' },
  { title: 'Bosch GBH 2-28 defekt für Bastler', price: 30, currency: 'EUR' },
  { title: 'Konvolut Bosch Bohrhämmer 3 Stück', price: 150, currency: 'EUR' },
  { title: 'Bosch GBH 2-28 F OVP neu', price: 189, currency: 'EUR' },
  { title: 'Makita DHR202 Bohrhammer', price: 120, currency: 'EUR' },
  { title: 'Bosch GBH 2-28 F', price: 40, currency: 'USD' },
  { title: 'Bosch GBH 2-28 F Sammlerstück', price: 890, currency: 'EUR' },
];

const context = {
  keywords: 'Bosch GBH 2-28 F',
  brand: 'Bosch',
  model: 'GBH 2-28 F',
  product: 'Schlagbohrmaschine',
  itemCondition: 'Gut',
  requireModel: true,
  requireBrand: true,
};

describe('selectComparableListings', () => {
  it('keeps the matching used drills and names every other reason', () => {
    const result = selectComparableListings(bosch, context);

    expect(result.kept.map((listing) => listing.price)).toEqual([84.99, 95, 110]);
    expect(result.median).toBe(95);
    expect(result.excludedCount).toBe(7);
    expect(result.filterNote).toBe(
      '7 Anzeigen weggelassen: Zubehör, Defekt, Konvolut, falscher Zustand, andere Währung, anderes Produkt, Ausreißer.',
    );
  });

  it('keeps defect listings when the item itself is defective and still drops new ones', () => {
    const result = selectComparableListings(bosch, { ...context, itemCondition: 'Defekt' });

    expect(result.kept.map((listing) => listing.title)).toContain('Bosch GBH 2-28 defekt für Bastler');
    expect(result.kept.map((listing) => listing.title)).not.toContain('Bosch GBH 2-28 F OVP neu');
  });

  it('does not treat a case as junk when the item is the case', () => {
    const result = selectComparableListings(
      [
        { title: 'Apple Hülle für iPhone 13', price: 15, currency: 'EUR' },
        { title: 'Samsung Hülle Galaxy', price: 8, currency: 'EUR' },
      ],
      {
        keywords: 'Apple Hülle iPhone 13',
        brand: 'Apple',
        model: 'iPhone 13',
        product: 'Hülle',
        itemCondition: 'Gut',
        requireBrand: true,
        requireModel: true,
      },
    );

    expect(result.kept.map((listing) => listing.title)).toEqual(['Apple Hülle für iPhone 13']);
  });

  it('leaves a short list alone instead of dropping it as outliers', () => {
    const result = selectComparableListings(
      [
        { title: 'Jacke', price: 20, currency: 'EUR' },
        { title: 'Jacke', price: 80, currency: 'EUR' },
      ],
      { keywords: 'Jacke', itemCondition: 'Gut' },
    );

    expect(result.kept).toHaveLength(2);
    expect(result.median).toBe(50);
    expect(result.filterNote).toBeNull();
  });
});
