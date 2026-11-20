import { buildListingCopyFacts, suggestKleinanzeigenCategory } from './kleinanzeigen-category';

describe('suggestKleinanzeigenCategory', () => {
  it('maps shoes, phones and books onto Kleinanzeigen paths', () => {
    expect(suggestKleinanzeigenCategory({ category: 'Schuhe', categoryDetail: 'Sneaker', title: 'Nike' }).path).toBe(
      'Mode & Beauty > Schuhe',
    );
    expect(
      suggestKleinanzeigenCategory({ category: 'Elektronik', categoryDetail: 'Smartphone', title: 'iPhone' }).path,
    ).toBe('Elektronik > Handy & Telefon');
    expect(suggestKleinanzeigenCategory({ category: 'Medien', categoryDetail: null, title: 'Roman' }).path).toBe(
      'Musik, Filme & Bücher > Bücher & Zeitschriften',
    );
  });

  it('does not invent a path when nothing was recognized', () => {
    const suggestion = suggestKleinanzeigenCategory({ category: null, categoryDetail: null, title: null });
    expect(suggestion.path).toBe('Sonstiges');
    expect(suggestion.note).toMatch(/nicht automatisch/);
  });
});

describe('buildListingCopyFacts', () => {
  it('keeps the eBay condition next to the Kleinanzeigen path', () => {
    const facts = buildListingCopyFacts({
      category: 'Kleidung',
      categoryDetail: 'Jacke',
      title: 'Wolljacke',
      condition: 'Gut',
    });
    expect(facts.kleinanzeigenCategory.path).toBe('Mode & Beauty > Kleidung');
    expect(facts.ebayCondition).toMatchObject({ code: 'USED_GOOD', conditionId: '5000' });
  });
});
