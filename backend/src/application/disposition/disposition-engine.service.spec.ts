import { EMPTY_LOGISTICS } from '../../domain/logistics/logistics-profile';
import { DispositionEngineService, ProductProfile } from './disposition-engine.service';
import type { LogisticsProfile } from '../../domain/logistics/logistics-profile';

const smallParcel: LogisticsProfile = {
  captured: true,
  weightGrams: 180,
  lengthCm: 22,
  widthCm: 16,
  heightCm: 2,
  bulky: false,
  pickupOnly: false,
  shippingPossible: true,
  postalCode: '10115',
};

const sofa: LogisticsProfile = {
  captured: true,
  weightGrams: 45_000,
  lengthCm: 210,
  widthCm: 95,
  heightCm: 85,
  bulky: true,
  pickupOnly: true,
  shippingPossible: false,
  postalCode: '10115',
};

const baseProfile: ProductProfile = {
  id: 'p1',
  category: 'household',
  condition: 'good',
  marketMedianPrice: 50,
  logistics: EMPTY_LOGISTICS,
  userGoal: 'BALANCED',
};

describe('DispositionEngineService', () => {
  let service: DispositionEngineService;

  beforeEach(() => {
    service = new DispositionEngineService();
  });

  it('recommends DONATE below the low-value threshold for used items', () => {
    const result = service.evaluate({ ...baseProfile, marketMedianPrice: 4, condition: 'good' });
    expect(result.action).toBe('DONATE');
    expect(result.recommendedPlatforms).toHaveLength(0);
  });

  it('does not donate a NEW item even below the threshold', () => {
    const result = service.evaluate({ ...baseProfile, marketMedianPrice: 4, condition: 'new' });
    expect(result.action).not.toBe('DONATE');
  });

  it('recommends BUYBACK_SERVICE for electronics when the user wants a fast sale', () => {
    const result = service.evaluate({
      ...baseProfile,
      category: 'electronics',
      marketMedianPrice: 100,
      userGoal: 'FAST_SALE',
    });
    expect(result.action).toBe('BUYBACK_SERVICE');
  });

  it('does not force BUYBACK_SERVICE for electronics when the goal is MAX_PROFIT', () => {
    const result = service.evaluate({
      ...baseProfile,
      category: 'electronics',
      marketMedianPrice: 100,
      userGoal: 'MAX_PROFIT',
    });
    expect(result.action).toBe('SELL_ONLINE');
  });

  it('routes a sofa to local pickup and recommends no shipping portal', () => {
    const result = service.evaluate({ ...baseProfile, logistics: sofa, marketMedianPrice: 80 });
    expect(result.action).toBe('LOCAL_PICKUP_ONLY');
    expect(result.shippingCostEur).toBe(0);
    expect(result.recommendedPlatforms.map((p) => p.key)).toEqual(['KLEINANZEIGEN']);
    expect(result.recommendedPlatforms.some((p) => p.key === 'EBAY' || p.key === 'VINTED')).toBe(false);
    expect(result.recommendedPlatforms[0].netExpectedValue).toBe(80);
  });

  it('keeps an oversized sofa off shipping portals even when shipping was ticked', () => {
    const result = service.evaluate({
      ...baseProfile,
      marketMedianPrice: 80,
      logistics: { ...sofa, bulky: false, pickupOnly: false, shippingPossible: true },
    });
    expect(result.action).toBe('LOCAL_PICKUP_ONLY');
    expect(result.recommendedPlatforms.map((p) => p.key)).toEqual(['KLEINANZEIGEN']);
  });

  it('recommends shipping portals for a small parcel and drops the flat 1.50 € deduction', () => {
    const result = service.evaluate({
      ...baseProfile,
      marketMedianPrice: 40,
      logistics: smallParcel,
    });
    expect(result.action).toBe('SELL_ONLINE');
    expect(result.shippingCostEur).toBe(1.95);
    expect(result.shippingCostEur).not.toBe(1.5);
    expect(result.recommendedPlatforms.map((p) => p.key)).toEqual(['KLEINANZEIGEN', 'EBAY', 'VINTED']);
    for (const platform of result.recommendedPlatforms) {
      expect(platform.netExpectedValue).toBe(38.05);
    }
  });

  it('without a logistics profile recommends only Kleinanzeigen and does not subtract 1.50 €', () => {
    const result = service.evaluate({ ...baseProfile, category: 'fashion', marketMedianPrice: 40 });
    expect(result.action).toBe('SELL_ONLINE');
    expect(result.shippingCostEur).toBe(0);
    expect(result.recommendedPlatforms.map((p) => p.key)).toEqual(['KLEINANZEIGEN']);
    expect(result.recommendedPlatforms[0].netExpectedValue).toBe(40);
  });
});
