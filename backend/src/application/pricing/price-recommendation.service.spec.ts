import { ASKING_TO_REALIZED_FACTOR, PriceRecommendationService } from './price-recommendation.service';
import { PriceResearchSourceResult } from './price-triangulation.service';

function marketSource(overrides: Partial<PriceResearchSourceResult> = {}): PriceResearchSourceResult {
  return {
    source: 'EBAY_ACTIVE_LISTINGS',
    providerLabel: 'eBay Browse API (Mock)',
    median: 100,
    p25: 90,
    p75: 110,
    sampleSize: 10,
    currency: 'EUR',
    ...overrides,
  };
}

function buybackSource(
  median: number,
  overrides: Partial<PriceResearchSourceResult> = {},
): PriceResearchSourceResult {
  return {
    source: 'ANKAUF_PORTAL',
    providerLabel: 'Ankaufportal',
    median,
    p25: null,
    p75: null,
    sampleSize: 1,
    currency: 'EUR',
    detail: { illustrative: false },
    ...overrides,
  };
}

describe('PriceRecommendationService', () => {
  const service = new PriceRecommendationService();

  it('returns null when no market distribution source produced data (buyback alone is not a sell-price suggestion)', () => {
    const result = service.recommend([buybackSource(30)], null);
    expect(result).toBeNull();
  });

  it('derives target/list/min prices from a single market source using the documented asking->realized factor', () => {
    const result = service.recommend([marketSource({ median: 100, sampleSize: 10 })], 'BALANCED');

    expect(result).not.toBeNull();
    const expectedTarget = Math.round(100 * ASKING_TO_REALIZED_FACTOR * 100) / 100;
    expect(result!.targetPrice).toBeCloseTo(expectedTarget, 2);
    expect(result!.listPrice).toBeGreaterThan(result!.targetPrice); // BALANCED markup > 0
    expect(result!.minPrice).toBeLessThan(result!.targetPrice); // BALANCED discount > 0
  });

  it('weights multiple market sources by sample size, not a plain average', () => {
    const result = service.recommend(
      [
        marketSource({ source: 'EBAY_ACTIVE_LISTINGS', median: 100, sampleSize: 20 }),
        marketSource({ source: 'GEMINI_GROUNDING', providerLabel: 'Gemini', median: 200, sampleSize: 5 }),
      ],
      null,
    );

    // gewichteter Median: (100*20 + 200*5) / 25 = 120, nicht der einfache Durchschnitt 150
    const expectedWeightedMedian = (100 * 20 + 200 * 5) / 25;
    const expectedTarget = Math.round(expectedWeightedMedian * ASKING_TO_REALIZED_FACTOR * 100) / 100;
    expect(result!.targetPrice).toBeCloseTo(expectedTarget, 2);
  });

  it('produces a wider FAST_SALE band (no markup, larger discount) than MAX_PROFIT', () => {
    const fast = service.recommend([marketSource({ median: 100, sampleSize: 10 })], 'FAST_SALE')!;
    const maxProfit = service.recommend([marketSource({ median: 100, sampleSize: 10 })], 'MAX_PROFIT')!;

    expect(fast.listPrice).toBe(fast.targetPrice); // FAST_SALE markup = 0
    expect(maxProfit.listPrice).toBeGreaterThan(fast.listPrice);
    expect(fast.minPrice).toBeLessThan(maxProfit.minPrice);
  });

  it('raises minPrice to at least the buyback price (never suggest selling below the instant-cash floor)', () => {
    const result = service.recommend(
      [marketSource({ median: 50, sampleSize: 10 }), buybackSource(45)],
      'FAST_SALE',
    )!;

    expect(result.minPrice).toBeGreaterThanOrEqual(45);
  });

  it('flags buybackRecommended when the buyback price is close to the target price', () => {
    const closeToTarget = service.recommend(
      [marketSource({ median: 100, sampleSize: 10 }), buybackSource(80)], // target ~87, 80 >= 0.85*87 ~ 74
      'BALANCED',
    )!;
    const farFromTarget = service.recommend(
      [marketSource({ median: 100, sampleSize: 10 }), buybackSource(10)],
      'BALANCED',
    )!;

    expect(closeToTarget.buybackRecommended).toBe(true);
    expect(farFromTarget.buybackRecommended).toBe(false);
  });

  it('does not let an illustrative Momox mock raise minPrice or recommend buyback', () => {
    const marketOnly = service.recommend([marketSource({ median: 50, sampleSize: 10 })], 'FAST_SALE')!;
    const withMock = service.recommend(
      [
        marketSource({ median: 50, sampleSize: 10 }),
        buybackSource(45, { providerLabel: 'momox (Mock)', detail: { illustrative: true } }),
      ],
      'FAST_SALE',
    )!;

    expect(withMock.minPrice).toBe(marketOnly.minPrice);
    expect(withMock.buybackRecommended).toBe(false);
    expect(withMock.reasoning.some((line) => line.includes('Beispiel'))).toBe(true);
  });

  it('treats a "(Mock)" provider label as illustrative even without the explicit flag', () => {
    const marketOnly = service.recommend([marketSource({ median: 100, sampleSize: 10 })], 'BALANCED')!;
    const result = service.recommend(
      [marketSource({ median: 100, sampleSize: 10 }), buybackSource(120, { providerLabel: 'momox (Mock)', detail: {} })],
      'BALANCED',
    )!;

    expect(result.buybackRecommended).toBe(false);
    expect(result.minPrice).toBe(marketOnly.minPrice);
    expect(result.minPrice).toBeLessThan(120);
  });

  it('reports LOW confidence below the medium threshold, MEDIUM at/above it, HIGH at/above the high threshold', () => {
    const low = service.recommend([marketSource({ sampleSize: 3 })], null)!;
    const medium = service.recommend([marketSource({ sampleSize: 5 })], null)!;
    const high = service.recommend([marketSource({ sampleSize: 20 })], null)!;

    expect(low.confidence).toBe('LOW');
    expect(medium.confidence).toBe('MEDIUM');
    expect(high.confidence).toBe('HIGH');
  });

  it('always includes a human-readable reasoning trail (never a blackbox number)', () => {
    const result = service.recommend([marketSource(), buybackSource(30)], 'MAX_PROFIT')!;

    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.reasoning.some((r) => r.includes('Konfidenz'))).toBe(true);
  });
});
