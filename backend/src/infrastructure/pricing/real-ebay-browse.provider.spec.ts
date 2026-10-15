import { ConfigService } from '@nestjs/config';
import { RealEbayBrowseProvider } from './real-ebay-browse.provider';

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    EBAY_CLIENT_ID: 'test-client-id',
    EBAY_CLIENT_SECRET: 'test-client-secret',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const TOKEN_RESPONSE = { access_token: 'tok-123', expires_in: 7200 };

function makeFetch(tokenBody = TOKEN_RESPONSE, searchBody: object = {}): jest.Mock {
  return jest.fn().mockImplementation((url: string) => {
    if (url.includes('oauth2/token')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(tokenBody) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(searchBody) });
  });
}

describe('RealEbayBrowseProvider', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns null for an empty keywords string', async () => {
    const provider = new RealEbayBrowseProvider(makeConfig());
    expect(await provider.search({ keywords: '  ', condition: null })).toBeNull();
  });

  it('returns null when fewer than 3 priced listings are returned', async () => {
    global.fetch = makeFetch(TOKEN_RESPONSE, {
      itemSummaries: [
        { title: 'Jacke', price: { value: '30' } },
        { title: 'Hemd', price: { value: '20' } },
      ],
    }) as unknown as typeof global.fetch;

    const provider = new RealEbayBrowseProvider(makeConfig());
    expect(await provider.search({ keywords: 'Jacke', condition: null })).toBeNull();
  });

  it('computes median / p25 / p75 from sorted prices', async () => {
    global.fetch = makeFetch(TOKEN_RESPONSE, {
      itemSummaries: [
        { title: 'A', price: { value: '10' } },
        { title: 'B', price: { value: '20' } },
        { title: 'C', price: { value: '30' } },
        { title: 'D', price: { value: '40' } },
        { title: 'E', price: { value: '50' } },
      ],
    }) as unknown as typeof global.fetch;

    const provider = new RealEbayBrowseProvider(makeConfig());
    const result = await provider.search({ keywords: 'Jacke', condition: null });

    expect(result).not.toBeNull();
    // For [10,20,30,40,50]: p=0.25 -> idx=1.0 -> sorted[1]=20; p=0.75 -> idx=3.0 -> sorted[3]=40
    expect(result!.median).toBe(30);
    expect(result!.p25).toBe(20);
    expect(result!.p75).toBe(40);
    expect(result!.sampleSize).toBe(5);
    expect(result!.currency).toBe('EUR');
    expect(result!.providerLabel).toBe('eBay Browse API');
  });

  it('filters out items with missing or non-numeric prices', async () => {
    global.fetch = makeFetch(TOKEN_RESPONSE, {
      itemSummaries: [
        { title: 'A', price: { value: '10' } },
        { title: 'B' }, // no price
        { title: 'C', price: { value: 'free' } }, // NaN
        { title: 'D', price: { value: '20' } },
        { title: 'E', price: { value: '30' } },
      ],
    }) as unknown as typeof global.fetch;

    const provider = new RealEbayBrowseProvider(makeConfig());
    const result = await provider.search({ keywords: 'Test', condition: null });

    expect(result).not.toBeNull();
    expect(result!.sampleSize).toBe(3);
  });

  it('reuses the cached token on a second call without fetching again', async () => {
    const mockFetch = makeFetch(TOKEN_RESPONSE, {
      itemSummaries: [
        { title: 'A', price: { value: '10' } },
        { title: 'B', price: { value: '20' } },
        { title: 'C', price: { value: '30' } },
      ],
    });
    global.fetch = mockFetch as unknown as typeof global.fetch;

    const provider = new RealEbayBrowseProvider(makeConfig());
    await provider.search({ keywords: 'X', condition: null });
    await provider.search({ keywords: 'Y', condition: null });

    const tokenCalls = mockFetch.mock.calls.filter((args: unknown[]) =>
      (args[0] as string).includes('oauth2/token'),
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it('returns null when the eBay search request fails', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('oauth2/token')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(TOKEN_RESPONSE) });
      }
      return Promise.resolve({ ok: false, status: 500 });
    }) as unknown as typeof global.fetch;

    const provider = new RealEbayBrowseProvider(makeConfig());
    // fetch returns ok:false for search -> empty array -> sampleSize < 3 -> null
    expect(await provider.search({ keywords: 'Jacke', condition: null })).toBeNull();
  });

  it('returns null when the OAuth request fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }) as unknown as typeof global.fetch;

    const provider = new RealEbayBrowseProvider(makeConfig());
    expect(await provider.search({ keywords: 'Jacke', condition: null })).toBeNull();
  });

  it('caps comparableListings at 10 even with more results', async () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      title: `Item ${i}`,
      price: { value: String(10 + i) },
    }));
    global.fetch = makeFetch(TOKEN_RESPONSE, { itemSummaries: items }) as unknown as typeof global.fetch;

    const provider = new RealEbayBrowseProvider(makeConfig());
    const result = await provider.search({ keywords: 'Test', condition: null });

    expect(result).not.toBeNull();
    expect(result!.comparableListings).toHaveLength(15);
    expect(result!.sampleSize).toBe(15);
  });
});
