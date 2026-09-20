import { DispositionEngineService, ProductProfile } from './disposition-engine.service';

const baseProfile: ProductProfile = {
  id: 'p1',
  category: 'household',
  condition: 'good',
  marketMedianPrice: 50,
  isBulky: false,
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

  it('routes bulky items to LOCAL_PICKUP_ONLY and excludes eBay', () => {
    const result = service.evaluate({ ...baseProfile, isBulky: true, marketMedianPrice: 80 });
    expect(result.action).toBe('LOCAL_PICKUP_ONLY');
    expect(result.recommendedPlatforms.some((p) => p.key === 'EBAY')).toBe(false);
  });

  it('adds Vinted as a channel for fashion items', () => {
    const result = service.evaluate({ ...baseProfile, category: 'fashion', marketMedianPrice: 40 });
    expect(result.recommendedPlatforms.some((p) => p.key === 'VINTED')).toBe(true);
  });

  it('sorts recommended platforms by descending net expected value', () => {
    const result = service.evaluate({ ...baseProfile, marketMedianPrice: 60 });
    const values = result.recommendedPlatforms.map((p) => p.netExpectedValue);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});
