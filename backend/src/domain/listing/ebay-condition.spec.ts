import { mapConditionToEbay } from './ebay-condition';

describe('mapConditionToEbay', () => {
  it.each([
    ['Neu', 'NEW', '1000'],
    ['Wie neu', 'LIKE_NEW', '2750'],
    ['Gut', 'USED_GOOD', '5000'],
    ['Gebraucht', 'USED_ACCEPTABLE', '6000'],
    ['Defekt', 'FOR_PARTS_OR_NOT_WORKING', '7000'],
    ['sehr guter Zustand', 'USED_VERY_GOOD', '4000'],
  ])('maps %s to %s / %s', (input, code, conditionId) => {
    expect(mapConditionToEbay(input)).toMatchObject({ code, conditionId });
  });

  it('does not guess an unclear condition', () => {
    expect(mapConditionToEbay(null)).toBeNull();
    expect(mapConditionToEbay('siehe fotos')).toBeNull();
  });
});
