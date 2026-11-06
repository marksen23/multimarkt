import { AnkaufResearchService } from './ankauf-research.service';
import type { AnkaufSearchProvider } from '../../domain/ankauf/ankauf-search-provider.interface';
import type { MarketDistributionProvider } from '../../domain/pricing/market-distribution-provider.interface';

function makeProvider(
  result: Parameters<AnkaufSearchProvider['search']>[0] extends infer _
    ? Awaited<ReturnType<AnkaufSearchProvider['search']>>
    : never,
): AnkaufSearchProvider {
  return { search: jest.fn().mockResolvedValue(result) };
}

const nullEbayProvider: MarketDistributionProvider = { search: jest.fn().mockResolvedValue(null) };
const PLACE = { postalCode: '50667', radiusKm: 20 };

function makeService(provider: AnkaufSearchProvider, ebayProvider: MarketDistributionProvider = nullEbayProvider) {
  return new AnkaufResearchService(provider, ebayProvider);
}

function search(service: AnkaufResearchService, keywords: string) {
  return service.search(keywords, PLACE);
}

describe('AnkaufResearchService', () => {
  it('returns empty listings and null median when provider returns null', async () => {
    const service = makeService(makeProvider(null));
    const result = await search(service, 'Test');
    expect(result.listings).toEqual([]);
    expect(result.marketMedianEur).toBeNull();
    expect(result.keywords).toBe('Test');
    expect(result.location).toBe('PLZ 50667 (20 km Umkreis)');
  });

  it('computes SEHR_GUT deal score for price <= 70% of median', async () => {
    const service = makeService(
      makeProvider({
        marketMedian: 100,
        listings: [{ title: 'A', price: 65, platform: 'KLEINANZEIGEN', url: null, condition: null }],
      }),
    );
    const result = await search(service, 'Jacke');
    expect(result.listings[0].dealScore).toBe('SEHR_GUT');
  });

  it('computes GUT deal score for price between 70% and 85% of median', async () => {
    const service = makeService(
      makeProvider({
        marketMedian: 100,
        listings: [{ title: 'B', price: 80, platform: 'VINTED', url: null, condition: null }],
      }),
    );
    const result = await search(service, 'Jacke');
    expect(result.listings[0].dealScore).toBe('GUT');
  });

  it('computes FAIR deal score for price between 85% and 105% of median', async () => {
    const service = makeService(
      makeProvider({
        marketMedian: 100,
        listings: [{ title: 'C', price: 95, platform: 'EBAY', url: null, condition: null }],
      }),
    );
    const result = await search(service, 'Jacke');
    expect(result.listings[0].dealScore).toBe('FAIR');
  });

  it('computes TEUER deal score for price > 105% of median', async () => {
    const service = makeService(
      makeProvider({
        marketMedian: 100,
        listings: [{ title: 'D', price: 120, platform: 'EBAY', url: null, condition: null }],
      }),
    );
    const result = await search(service, 'Jacke');
    expect(result.listings[0].dealScore).toBe('TEUER');
  });

  it('sets dealScore to null when no marketMedian is available', async () => {
    const service = makeService(
      makeProvider({
        marketMedian: null,
        listings: [{ title: 'E', price: 50, platform: 'VINTED', url: null, condition: null }],
      }),
    );
    const result = await search(service, 'Jacke');
    expect(result.listings[0].dealScore).toBeNull();
    expect(result.listings[0].priceVsMarketPct).toBeNull();
  });

  it('sorts listings by deal score (SEHR_GUT first, TEUER last)', async () => {
    const service = makeService(
      makeProvider({
        marketMedian: 100,
        listings: [
          { title: 'Teuer', price: 130, platform: 'EBAY', url: null, condition: null },
          { title: 'Sehr gut', price: 60, platform: 'KLEINANZEIGEN', url: null, condition: null },
          { title: 'Fair', price: 95, platform: 'VINTED', url: null, condition: null },
          { title: 'Gut', price: 78, platform: 'FACEBOOK', url: null, condition: null },
        ],
      }),
    );
    const result = await search(service, 'Test');
    const scores = result.listings.map((l) => l.dealScore);
    expect(scores).toEqual(['SEHR_GUT', 'GUT', 'FAIR', 'TEUER']);
  });

  it('computes priceVsMarketPct correctly', async () => {
    const service = makeService(
      makeProvider({
        marketMedian: 80,
        listings: [{ title: 'F', price: 60, platform: 'KLEINANZEIGEN', url: null, condition: null }],
      }),
    );
    const result = await search(service, 'Test');
    // (60 - 80) / 80 * 100 = -25
    expect(result.listings[0].priceVsMarketPct).toBe(-25);
  });

  it('filters out listings with price <= 0', async () => {
    const service = makeService(
      makeProvider({
        marketMedian: 50,
        listings: [
          { title: 'Valid', price: 40, platform: 'EBAY', url: null, condition: null },
          { title: 'Zero', price: 0, platform: 'VINTED', url: null, condition: null },
        ],
      }),
    );
    const result = await search(service, 'Test');
    expect(result.listings).toHaveLength(1);
    expect(result.listings[0].title).toBe('Valid');
  });

  it('returns conditionPriceImpact with all four conditions', async () => {
    const service = makeService(makeProvider(null));
    const result = await search(service, 'Test');
    expect(Object.keys(result.conditionPriceImpact)).toContain('wie_neu');
    expect(Object.keys(result.conditionPriceImpact)).toContain('gut');
    expect(Object.keys(result.conditionPriceImpact)).toContain('gebraucht');
    expect(Object.keys(result.conditionPriceImpact)).toContain('defekt');
    expect(result.conditionPriceImpact['wie_neu'].factor).toBeGreaterThan(1);
    expect(result.conditionPriceImpact['defekt'].factor).toBeLessThan(0.6);
  });

  it('asks the source for the profile place, not a fixed city', async () => {
    const searchFn = jest.fn().mockResolvedValue(null);
    const service = makeService({ search: searchFn });
    const result = await service.search('Jacke', { postalCode: '80331', radiusKm: 50 });
    expect(searchFn).toHaveBeenCalledWith({
      keywords: 'Jacke',
      location: 'PLZ 80331 (50 km Umkreis)',
    });
    expect(result.location).toBe('PLZ 80331 (50 km Umkreis)');
  });

  it('reads the source condition and marks a title-only hint uncertain', async () => {
    const service = makeService(
      makeProvider({
        marketMedian: 100,
        listings: [
          {
            title: 'Jacke wie neu OVP defekt',
            price: 40,
            platform: 'EBAY',
            url: null,
            condition: null,
          },
          {
            title: 'Jacke defekt kaputt',
            price: 90,
            platform: 'VINTED',
            url: null,
            condition: 'Gut erhalten',
          },
          {
            title: 'Jacke',
            price: 30,
            platform: 'KLEINANZEIGEN',
            url: null,
            condition: 'Defekt — Sohle löst sich',
          },
          {
            title: 'Jacke siehe Text',
            price: 70,
            platform: 'FACEBOOK',
            url: null,
            condition: 'siehe Beschreibung',
          },
        ],
      }),
    );
    const result = await search(service, 'Jacke');
    const byPrice = (price: number) => result.listings.find((listing) => listing.price === price);
    expect(byPrice(40)).toMatchObject({
      condition: null,
      conditionKey: null,
      conditionUncertain: true,
    });
    expect(byPrice(90)).toMatchObject({
      condition: 'Gut erhalten',
      conditionKey: 'gut',
      conditionUncertain: false,
    });
    expect(byPrice(30)).toMatchObject({
      conditionKey: 'defekt',
      conditionUncertain: false,
    });
    expect(byPrice(70)).toMatchObject({
      condition: 'siehe Beschreibung',
      conditionKey: null,
      conditionUncertain: true,
    });
  });
});
