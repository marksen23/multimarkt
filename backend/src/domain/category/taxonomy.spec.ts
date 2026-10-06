import { planFreeTextAttributeMigration, StoredAttribute } from './attribute-migration';
import {
  canonicalCategory,
  prefersBuyback,
  projectVisionClaims,
  requiredFactsFor,
  resolveCategory,
} from './taxonomy';

function row(partial: Partial<StoredAttribute> & Pick<StoredAttribute, 'id' | 'attributeKey'>): StoredAttribute {
  return {
    itemId: 'item-1',
    attributeValue: null,
    truthState: 'INFERRED',
    source: 'legacy',
    ...partial,
  };
}

describe('resale category taxonomy', () => {
  it('keeps the seven categories and only the facts each one needs', () => {
    expect(requiredFactsFor('Kleidung')).toEqual(['size', 'brand']);
    expect(requiredFactsFor('Schuhe')).toEqual(['size', 'brand']);
    expect(requiredFactsFor('Elektronik')).toEqual(['brand', 'functionChecked']);
    expect(requiredFactsFor('Medien')).toEqual([]);
    expect(requiredFactsFor('Haushalt')).toEqual(['measurements']);
    expect(requiredFactsFor('Möbel')).toEqual(['measurements']);
    expect(requiredFactsFor('Sonstiges')).toEqual([]);
  });

  it('maps free-text and the old english keys onto the taxonomy', () => {
    expect(resolveCategory('Bekleidung > Herren > Jacken')).toBe('Kleidung');
    expect(resolveCategory('Sneaker')).toBe('Schuhe');
    expect(resolveCategory('Kinderpullover')).toBe('Kleidung');
    expect(resolveCategory('electronics')).toBe('Elektronik');
    expect(resolveCategory('books')).toBe('Medien');
    expect(resolveCategory('media')).toBe('Medien');
    expect(resolveCategory('household')).toBe('Haushalt');
    expect(resolveCategory('furniture')).toBe('Möbel');
    expect(resolveCategory('Handschuhe')).toBe('Kleidung');
    expect(canonicalCategory('kleidung')).toBe('Kleidung');
    expect(resolveCategory('keine Ahnung')).toBeNull();
  });

  it('treats Elektronik and Medien as buyback categories, including the old keys', () => {
    expect(prefersBuyback('Elektronik')).toBe(true);
    expect(prefersBuyback('electronics')).toBe(true);
    expect(prefersBuyback('books')).toBe(true);
    expect(prefersBuyback('Möbel')).toBe(false);
    expect(prefersBuyback('fashion')).toBe(false);
  });

  it('fills only what the image analysis saw and asks the category gaps', () => {
    const projected = projectVisionClaims([
      { key: 'category', value: 'Bekleidung > Herren > Jacken', confidence: 0.9 },
      { key: 'color', value: 'Schwarz', confidence: 0.8 },
      { key: 'brand', value: null, confidence: 0.2 },
      { key: 'size', value: null, confidence: 0 },
      { key: 'measurements', value: '80 cm', confidence: 0.4 },
      { key: 'functionChecked', value: 'ja', confidence: 0.5 },
      { key: 'material', value: 'Polyester', confidence: 0.6 },
    ]);

    const byKey = new Map(projected.map((claim) => [claim.key, claim.value]));
    expect(byKey.get('category')).toBe('Kleidung');
    expect(byKey.get('categoryDetail')).toBe('Bekleidung > Herren > Jacken');
    expect(byKey.get('color')).toBe('Schwarz');
    expect(byKey.get('material')).toBe('Polyester');
    expect(byKey.get('size')).toBeNull();
    expect(byKey.get('brand')).toBeNull();
    expect(byKey.get('measurements')).toBe('80 cm');
    expect(byKey.get('functionChecked')).toBe('ja');
  });

  it('does not invent required facts when the category itself was not visible', () => {
    const projected = projectVisionClaims([{ key: 'brand', value: 'Nike', confidence: 0.9 }]);
    expect(projected.map((claim) => claim.key).sort()).toEqual(['brand', 'category']);
    expect(projected.find((claim) => claim.key === 'category')?.value).toBeNull();
    expect(projected.find((claim) => claim.key === 'brand')?.value).toBe('Nike');
  });
});

describe('planFreeTextAttributeMigration', () => {
  it('renames Größe and Marke and maps a clothing category forward', () => {
    const ops = planFreeTextAttributeMigration([
      row({ id: 'c', attributeKey: 'kategorie', attributeValue: 'Kinderpullover', truthState: 'USER_CONFIRMED' }),
      row({ id: 's', attributeKey: 'größe', attributeValue: '98', truthState: 'USER_CONFIRMED' }),
      row({ id: 'b', attributeKey: 'Marke', attributeValue: 'H&M', truthState: 'INFERRED' }),
    ]);

    expect(ops).toEqual([
      {
        op: 'insert',
        itemId: 'item-1',
        attributeKey: 'categoryDetail',
        attributeValue: 'Kinderpullover',
        truthState: 'USER_CONFIRMED',
        source: 'legacy',
      },
      {
        op: 'update',
        id: 'c',
        attributeKey: 'category',
        attributeValue: 'Kleidung',
        truthState: 'USER_CONFIRMED',
      },
      {
        op: 'update',
        id: 's',
        attributeKey: 'size',
        attributeValue: '98',
        truthState: 'USER_CONFIRMED',
      },
      {
        op: 'update',
        id: 'b',
        attributeKey: 'brand',
        attributeValue: 'H&M',
        truthState: 'INFERRED',
      },
    ]);
  });

  it('keeps the confirmed canonical row when a free-text alias duplicates it', () => {
    const ops = planFreeTextAttributeMigration([
      row({ id: 'size', attributeKey: 'size', attributeValue: 'M', truthState: 'USER_CONFIRMED' }),
      row({ id: 'alias', attributeKey: 'größe', attributeValue: '98', truthState: 'INFERRED' }),
    ]);

    expect(ops).toEqual([{ op: 'delete', id: 'alias' }]);
  });

  it('does not invent Sonstiges for text that matches no category', () => {
    const ops = planFreeTextAttributeMigration([
      row({
        id: 'c',
        attributeKey: 'category',
        attributeValue: 'Quatschwort',
        truthState: 'USER_CONFIRMED',
      }),
    ]);

    expect(ops).toEqual([
      {
        op: 'insert',
        itemId: 'item-1',
        attributeKey: 'categoryDetail',
        attributeValue: 'Quatschwort',
        truthState: 'USER_CONFIRMED',
        source: 'legacy',
      },
      {
        op: 'update',
        id: 'c',
        attributeKey: 'category',
        attributeValue: null,
        truthState: 'UNKNOWN',
      },
    ]);
  });

  it('leaves an already canonical category untouched', () => {
    expect(
      planFreeTextAttributeMigration([
        row({
          id: 'c',
          attributeKey: 'category',
          attributeValue: 'Medien',
          truthState: 'USER_CONFIRMED',
        }),
      ]),
    ).toEqual([]);
  });
});
