import { buildMarketQueryLadder } from './market-query-ladder';

describe('buildMarketQueryLadder', () => {
  it('starts with the vision phrase plus a type-plate code, then drops both', () => {
    expect(
      buildMarketQueryLadder({
        searchTerms: 'Bosch GBH 2-28 F Schlagbohrmaschine',
        brand: 'Bosch',
        model: 'GBH 2-28 F',
        category: 'Elektronik',
        categoryDetail: 'Schlagbohrmaschine',
        color: 'Blau',
        specs: [
          { key: 'spec:Leistung', value: '850 W' },
          { key: 'spec:Typ', value: '0611267000' },
          { key: 'spec:Seriennummer', value: '123456789' },
        ],
      }).map((step) => step.keywords),
    ).toEqual([
      'Bosch GBH 2-28 F Schlagbohrmaschine Blau 0611267000',
      'Bosch GBH 2-28 F Schlagbohrmaschine',
      'Schlagbohrmaschine',
    ]);
  });

  it('drops the color before it drops the model', () => {
    const steps = buildMarketQueryLadder({
      brand: 'Nike',
      category: 'Schuhe',
      categoryDetail: 'Air Max 90',
      color: 'Schwarz',
    });

    expect(steps.map((step) => [step.level, step.keywords])).toEqual([
      ['specific', 'Nike Air Max 90 Schwarz'],
      ['broader', 'Nike Air Max 90'],
      ['broad', 'Air Max 90'],
    ]);
  });

  it('returns no step when the only clue is a coarse category', () => {
    expect(buildMarketQueryLadder({})).toEqual([]);
    expect(buildMarketQueryLadder({ category: 'Elektronik' })).toEqual([]);
  });
});
