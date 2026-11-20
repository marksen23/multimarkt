import { ConfigService } from '@nestjs/config';
import { EBAY_AUTH_MESSAGE, EBAY_MISSING_KEYS_MESSAGE, EBAY_UNAVAILABLE_MESSAGE } from '../../domain/pricing/market-search-error';
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

  it('keeps a thin sample instead of hiding one or two real listings', async () => {
    global.fetch = makeFetch(TOKEN_RESPONSE, {
      itemSummaries: [
        { title: 'Jacke', price: { value: '30' } },
        { title: 'Hemd', price: { value: '20' } },
      ],
    }) as unknown as typeof global.fetch;

    const provider = new RealEbayBrowseProvider(makeConfig());
    const result = await provider.search({ keywords: 'Jacke', condition: null });

    expect(result?.sampleSize).toBe(2);
    expect(result?.median).toBe(25);
    expect(result?.comparableListings).toHaveLength(2);
  });

  it('asks for used condition ids and falls back when that filter matches nothing', async () => {
    const fetchMock = jest.fn().mockImplementation((url: string) => {
      if (String(url).includes('oauth2/token')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(TOKEN_RESPONSE) });
      }
      if (String(url).includes('conditionIds')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ itemSummaries: [] }) });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            itemSummaries: [
              { title: 'A', price: { value: '10' } },
              { title: 'B', price: { value: '20' } },
              { title: 'C', price: { value: '30' } },
            ],
          }),
      });
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const provider = new RealEbayBrowseProvider(makeConfig());
    const result = await provider.search({ keywords: 'Jacke', condition: null });

    const searchCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('item_summary'));
    expect(String(searchCalls[0][0])).toContain('conditionIds%3A%7B3000%7C4000%7C5000%7C6000%7D');
    expect(String(searchCalls[0][0])).toContain('itemLocationCountry%3ADE');
    expect(searchCalls[0][1].headers['X-EBAY-C-MARKETPLACE-ID']).toBe('EBAY_DE');
    expect(searchCalls[0][1].headers['X-EBAY-C-ENDUSERCTX']).toBe('contextualLocation=country=DE');
    expect(String(searchCalls[1][0])).toContain('conditionIds');
    expect(String(searchCalls[1][0])).not.toContain('itemLocationCountry');
    expect(String(searchCalls[2][0])).not.toContain('conditionIds');
    expect(String(searchCalls[2][0])).toContain('itemLocationCountry%3ADE');
    expect(result?.sampleSize).toBe(3);
    expect(result?.currency).toBe('EUR');
    expect(result?.priceKind).toBe('ASKING');
    expect(result?.marketplace).toBe('EBAY_DE');
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

  it('says in German when the eBay search request fails', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('oauth2/token')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(TOKEN_RESPONSE) });
      }
      return Promise.resolve({ ok: false, status: 500 });
    }) as unknown as typeof global.fetch;

    const provider = new RealEbayBrowseProvider(makeConfig());
    await expect(provider.search({ keywords: 'Jacke', condition: null })).rejects.toThrow(EBAY_UNAVAILABLE_MESSAGE);
  });

  it('says in German when the OAuth request is rejected', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }) as unknown as typeof global.fetch;

    const provider = new RealEbayBrowseProvider(makeConfig());
    await expect(provider.search({ keywords: 'Jacke', condition: null })).rejects.toThrow(EBAY_AUTH_MESSAGE);
  });

  it('says in German when the keys are missing and does not call eBay', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const provider = new RealEbayBrowseProvider(makeConfig({ EBAY_CLIENT_ID: '', EBAY_CLIENT_SECRET: '' }));
    await expect(provider.search({ keywords: 'Bosch', condition: 'Gut' })).rejects.toThrow(EBAY_MISSING_KEYS_MESSAGE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the German hammer-drill comps from a recorded Browse response and drops the rest', async () => {
    global.fetch = makeFetch(TOKEN_RESPONSE, RECORDED_BOSCH_SEARCH) as unknown as typeof global.fetch;

    const provider = new RealEbayBrowseProvider(makeConfig());
    const result = await provider.search({
      keywords: 'Bosch GBH 2-28 F',
      condition: 'Gut',
      brand: 'Bosch',
      model: 'GBH 2-28 F',
      product: 'Schlagbohrmaschine',
      postalCode: '50667',
      requireModel: true,
      requireBrand: true,
    });

    expect(result?.currency).toBe('EUR');
    expect(result?.marketplace).toBe('EBAY_DE');
    expect(result?.priceKind).toBe('ASKING');
    expect(result?.comparableListings.map((listing) => listing.title)).toEqual([
      'Bosch GBH 2-28 F Bohrhammer gebraucht',
      'Bosch GBH 2-28 F sehr gut mit Koffer',
      'Bosch Professional GBH 2-28 F',
    ]);
    expect(result?.comparableListings[0].url).toBe('https://www.ebay.de/itm/111');
    expect(result?.comparableListings[0].price).toBe(84.99);
    expect(result?.median).toBe(95);
    expect(result?.sampleSize).toBe(3);
    expect(result?.filterNote).toMatch(/Zubehör/);
    expect(result?.filterNote).toMatch(/Defekt/);
    expect(result?.filterNote).toMatch(/Konvolut/);
    expect(result?.filterNote).toMatch(/falscher Zustand/);
    expect(result?.filterNote).toMatch(/andere Währung/);
    expect(result?.filterNote).toMatch(/anderes Produkt/);
    expect(result?.filterNote).toMatch(/Ausreißer/);

    const searchCall = (global.fetch as jest.Mock).mock.calls.find((call) => String(call[0]).includes('item_summary'));
    expect(searchCall?.[1].headers['X-EBAY-C-ENDUSERCTX']).toBe('contextualLocation=country=DE,zip=50667');
    expect(searchCall?.[1].headers['Accept-Language']).toBe('de-DE');
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

/** Sanitized item_summary payload in the shape the Browse API returns. */
const RECORDED_BOSCH_SEARCH = {
  itemSummaries: [
    {
      title: 'Bosch GBH 2-28 F Bohrhammer gebraucht',
      price: { value: '79.00', currency: 'EUR' },
      itemWebUrl: 'https://www.ebay.de/itm/111',
      condition: 'Gebraucht',
      shippingOptions: [{ shippingCostType: 'FIXED', shippingCost: { value: '5.99', currency: 'EUR' } }],
    },
    {
      title: 'Bosch GBH 2-28 F sehr gut mit Koffer',
      price: { value: '95.00', currency: 'EUR' },
      itemWebUrl: 'https://www.ebay.de/itm/222',
      condition: 'Sehr gut',
      shippingOptions: [{ shippingCostType: 'FREE', shippingCost: { value: '0.00', currency: 'EUR' } }],
    },
    {
      title: 'Bosch Professional GBH 2-28 F',
      price: { value: '110.00', currency: 'EUR' },
      itemWebUrl: 'https://www.ebay.de/itm/333',
      condition: 'Gut',
    },
    {
      title: 'Koffer für Bosch GBH 2-28',
      price: { value: '25.00', currency: 'EUR' },
      itemWebUrl: 'https://www.ebay.de/itm/444',
    },
    {
      title: 'Bosch GBH 2-28 defekt für Bastler',
      price: { value: '30.00', currency: 'EUR' },
      itemWebUrl: 'https://www.ebay.de/itm/555',
    },
    {
      title: 'Konvolut Bosch Bohrhämmer 3 Stück',
      price: { value: '150.00', currency: 'EUR' },
      itemWebUrl: 'https://www.ebay.de/itm/666',
    },
    {
      title: 'Bosch GBH 2-28 F OVP neu',
      price: { value: '189.00', currency: 'EUR' },
      itemWebUrl: 'https://www.ebay.de/itm/777',
    },
    {
      title: 'Makita DHR202 Bohrhammer',
      price: { value: '120.00', currency: 'EUR' },
      itemWebUrl: 'https://www.ebay.de/itm/888',
    },
    {
      title: 'Bosch GBH 2-28 F',
      price: { value: '40.00', currency: 'USD' },
      itemWebUrl: 'https://www.ebay.com/itm/999',
    },
    {
      title: 'Bosch GBH 2-28 F Sammlerstück',
      price: { value: '890.00', currency: 'EUR' },
      itemWebUrl: 'https://www.ebay.de/itm/1010',
    },
  ],
};
