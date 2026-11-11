import { buildMarketKeywords } from './market-keywords';

describe('buildMarketKeywords', () => {
  it('keeps brand plus category when that is all that is known', () => {
    expect(buildMarketKeywords({ brand: 'Nike', category: 'Sneaker' })).toBe('Nike Sneaker');
  });

  it('prefers the concrete article over the coarse category and appends color', () => {
    expect(
      buildMarketKeywords({
        brand: 'Nike',
        category: 'Schuhe',
        categoryDetail: 'Air Max 90',
        color: 'Schwarz',
      }),
    ).toBe('Nike Air Max 90 Schwarz');
  });

  it('uses the last segment of a taxonomy path instead of the whole path', () => {
    expect(
      buildMarketKeywords({
        category: 'Kleidung',
        categoryDetail: 'Bekleidung > Herren > Jacken & Mäntel',
      }),
    ).toBe('Jacken & Mäntel');
  });

  it('prefers the title over a coarse category such as Kleidung', () => {
    expect(buildMarketKeywords({ category: 'Kleidung', title: 'Herren Lederjacke L' })).toBe(
      'Herren Lederjacke L',
    );
  });

  it('falls back to the item title when no attribute is usable', () => {
    expect(buildMarketKeywords({ title: '  Herrenjacke L  ' })).toBe('Herrenjacke L');
  });

  it('returns an empty string when nothing identifies the item', () => {
    expect(buildMarketKeywords({})).toBe('');
  });

  it('does not repeat a color that is already in the product name', () => {
    expect(buildMarketKeywords({ brand: 'Apple', categoryDetail: 'iPhone schwarz', color: 'schwarz' })).toBe(
      'Apple iPhone schwarz',
    );
  });
});
