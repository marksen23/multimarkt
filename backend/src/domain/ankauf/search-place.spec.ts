import {
  DEFAULT_ANKAUF_RADIUS_KM,
  formatSearchLocation,
  isAnkaufRadiusKm,
} from './search-place';

describe('search place', () => {
  it('formats postal code and radius as the search location', () => {
    expect(formatSearchLocation('50667', 20)).toBe('PLZ 50667 (20 km Umkreis)');
  });

  it('accepts the radius steps and rejects a free number', () => {
    expect(isAnkaufRadiusKm(DEFAULT_ANKAUF_RADIUS_KM)).toBe(true);
    expect(isAnkaufRadiusKm(15)).toBe(false);
    expect(isAnkaufRadiusKm(0)).toBe(false);
  });
});
