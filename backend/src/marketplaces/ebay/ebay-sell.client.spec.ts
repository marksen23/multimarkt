import { EbaySellException } from '../../domain/errors/ebay-sell.exception';
import { EbaySellEnv } from '../../domain/listing/ebay-sell-readiness';
import { EbaySellClient } from './ebay-sell.client';

const env: EbaySellEnv = {
  clientId: 'app-id',
  clientSecret: 'cert-id',
  refreshToken: 'refresh-token',
  environment: 'production',
};

/** Aufgezeichnete Formen der Identity-, Taxonomy- und Inventory-Antworten. */
const RECORDED_REFRESH = { access_token: 'user-token', expires_in: 7200 };
const RECORDED_APP = { access_token: 'app-token', expires_in: 7200 };
const RECORDED_SUGGESTIONS = {
  categorySuggestions: [
    {
      category: { categoryId: '15709', categoryName: 'Herren-Sneaker' },
      categoryTreeNodeLevel: 4,
    },
  ],
};
const RECORDED_ASPECTS = {
  aspects: [
    { localizedAspectName: 'Marke', aspectConstraint: { aspectRequired: true } },
    { localizedAspectName: 'Farbe', aspectConstraint: { aspectRequired: false } },
  ],
};
const RECORDED_OFFER = { offerId: 'offer-15' };
const RECORDED_PUBLISH = { listingId: '334455667788' };
const RECORDED_ALREADY = {
  errors: [
    {
      errorId: 25002,
      domain: 'API_INVENTORY',
      message: 'Offer entity already exists.',
      parameters: [{ name: 'offerId', value: 'offer-existing' }],
    },
  ],
};

function route(url: string, init: RequestInit): { status: number; body: unknown } {
  if (url.includes('/oauth2/token')) {
    const form = String(init.body ?? '');
    return { status: 200, body: form.includes('grant_type=refresh_token') ? RECORDED_REFRESH : RECORDED_APP };
  }
  if (url.includes('get_category_suggestions')) return { status: 200, body: RECORDED_SUGGESTIONS };
  if (url.includes('get_item_aspects_for_category')) return { status: 200, body: RECORDED_ASPECTS };
  if (url.includes('/inventory_item/')) return { status: 204, body: null };
  if (url.endsWith('/offer') && init.method === 'POST') return { status: 201, body: RECORDED_OFFER };
  if (url.endsWith('/publish')) return { status: 200, body: RECORDED_PUBLISH };
  if (url.endsWith('/withdraw')) return { status: 204, body: null };
  return { status: 500, body: { errors: [{ errorId: 1, message: 'unexpected' }] } };
}

function fakeFetch(
  handler: (url: string, init: RequestInit) => { status: number; body: unknown } = (url, init) => route(url, init),
): jest.Mock {
  return jest.fn(async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    const result = handler(url, init ?? {});
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      text: async () => (result.body == null ? '' : JSON.stringify(result.body)),
    };
  });
}

describe('EbaySellClient', () => {
  it('publishes with the recorded taxonomy and inventory responses', async () => {
    const fetchMock = fakeFetch();
    const client = new EbaySellClient(env, fetchMock as unknown as typeof fetch);

    expect(await client.suggestCategory('Nike Air Max')).toEqual({
      categoryId: '15709',
      categoryName: 'Herren-Sneaker',
    });
    expect(await client.aspectsForCategory('15709')).toEqual([
      { name: 'Marke', required: true },
      { name: 'Farbe', required: false },
    ]);
    await client.putInventoryItem('r-1', { condition: 'USED_GOOD' });
    expect(await client.createOffer({ sku: 'r-1', marketplaceId: 'EBAY_DE' })).toEqual({ offerId: 'offer-15' });
    expect(await client.publishOffer('offer-15')).toEqual({ listingId: '334455667788' });
    await client.withdrawOffer('offer-15');

    const calls = fetchMock.mock.calls.map((call) => ({
      url: String(call[0]),
      init: call[1] as RequestInit,
    }));
    const suggestion = calls.find((call) => call.url.includes('get_category_suggestions'));
    expect(suggestion?.url).toContain('/category_tree/77/');
    expect(suggestion?.url).toContain('q=Nike+Air+Max');
    expect(suggestion?.init.headers).toMatchObject({ Authorization: 'Bearer app-token' });

    const inventory = calls.find((call) => call.url.includes('/inventory_item/'));
    expect(inventory?.init.method).toBe('PUT');
    expect(inventory?.init.headers).toMatchObject({
      Authorization: 'Bearer user-token',
      'Content-Language': 'de-DE',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_DE',
    });

    const refresh = calls.find((call) => String(call.init.body).includes('refresh_token'));
    expect(String(refresh?.init.body)).toContain('sell.inventory');
    expect(String(refresh?.init.body)).not.toContain('refresh-token-in-url');
    expect(calls.every((call) => call.url.startsWith('https://api.ebay.com/'))).toBe(true);
  });

  it('reuses the offer id when eBay says the offer already exists', async () => {
    const fetchMock = fakeFetch((url, init) => {
      if (url.endsWith('/offer') && init.method === 'POST') return { status: 400, body: RECORDED_ALREADY };
      return route(url, init);
    });
    const client = new EbaySellClient(env, fetchMock as unknown as typeof fetch);
    await expect(client.createOffer({ sku: 'r-1' })).resolves.toEqual({ offerId: 'offer-existing' });
  });

  it('sends the new price to the recorded bulk update and keeps the euro amount as a string', async () => {
    const fetchMock = fakeFetch((url, init) => {
      if (url.includes('/bulk_update_price_quantity')) {
        return { status: 200, body: { responses: [{ statusCode: 200, sku: 'sku-1', offerId: 'offer-15' }] } };
      }
      return route(url, init);
    });
    const client = new EbaySellClient(env, fetchMock as unknown as typeof fetch);
    await client.updateOfferPrice({ sku: 'sku-1', offerId: 'offer-15', priceEur: 32 });

    const call = fetchMock.mock.calls.find((entry) => String(entry[0]).includes('/bulk_update_price_quantity'));
    expect(call).toBeTruthy();
    const init = call?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      requests: [
        {
          sku: 'sku-1',
          offers: [{ offerId: 'offer-15', price: { value: '32.00', currency: 'EUR' } }],
        },
      ],
    });
    expect(String(init.headers && JSON.stringify(init.headers))).toContain('EBAY_DE');
  });

  it('turns a recorded eBay price error into a German message and does not treat it as success', async () => {
    const fetchMock = fakeFetch((url, init) => {
      if (url.includes('/bulk_update_price_quantity')) {
        return {
          status: 200,
          body: {
            responses: [
              {
                statusCode: 400,
                sku: 'sku-1',
                offerId: 'offer-15',
                errors: [{ errorId: 25002, message: 'Offer not available.' }],
              },
            ],
          },
        };
      }
      return route(url, init);
    });
    const client = new EbaySellClient(env, fetchMock as unknown as typeof fetch);
    await expect(client.updateOfferPrice({ sku: 'sku-1', offerId: 'offer-15', priceEur: 32 })).rejects.toThrow(
      /eBay meldet: Offer not available\. \(Fehler 25002\)/,
    );
  });

  it('turns an invalid refresh token into a German message and does not invent a listing', async () => {
    const fetchMock = fakeFetch(() => ({
      status: 400,
      body: { error: 'invalid_grant', error_description: 'token revoked' },
    }));
    const client = new EbaySellClient(env, fetchMock as unknown as typeof fetch);
    await expect(client.publishOffer('offer-1')).rejects.toBeInstanceOf(EbaySellException);
    await expect(client.publishOffer('offer-1')).rejects.toThrow(/Refresh-Token/);
  });
});
