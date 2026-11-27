import { Test } from '@nestjs/testing';
import { EbaySellException } from '../../domain/errors/ebay-sell.exception';
import { EbaySellEnv } from '../../domain/listing/ebay-sell-readiness';
import { EbaySetupClient } from './ebay-setup.client';

const env: EbaySellEnv = {
  clientId: 'app-id',
  clientSecret: 'cert-secret-value',
  refreshToken: 'v^1.1#stored-refresh-secret',
  environment: 'production',
};

const RECORDED_CODE_TOKEN = {
  access_token: 'v^1.1#user-access',
  expires_in: 7200,
  refresh_token: 'v^1.1#new-refresh-secret',
  refresh_token_expires_in: 47304000,
  token_type: 'User Access Token',
};

const RECORDED_IDENTITY = {
  userId: 'seller_de',
  username: 'verkauf_de',
  accountType: 'INDIVIDUAL',
  registrationMarketplaceId: 'EBAY_DE',
};

const RECORDED_FULFILLMENT = {
  total: 2,
  fulfillmentPolicies: [
    {
      name: 'Versand Deutschland',
      marketplaceId: 'EBAY_DE',
      fulfillmentPolicyId: '6200999000',
      localPickup: false,
      shippingOptions: [{ optionType: 'DOMESTIC', costType: 'FLAT_RATE' }],
    },
    {
      name: 'Abholung Köln',
      marketplaceId: 'EBAY_DE',
      fulfillmentPolicyId: '6200999111',
      localPickup: true,
      shippingOptions: [],
    },
  ],
};

const RECORDED_PAYMENT = {
  total: 1,
  paymentPolicies: [{ name: 'Zahlung über eBay', marketplaceId: 'EBAY_DE', paymentPolicyId: '6200888000' }],
};

const RECORDED_RETURN = {
  total: 1,
  returnPolicies: [
    { name: 'Keine Rückgabe', marketplaceId: 'EBAY_DE', returnPolicyId: '6200777000', returnsAccepted: false },
  ],
};

const RECORDED_LOCATIONS = {
  total: 1,
  locations: [
    {
      name: 'Lager',
      merchantLocationKey: 'lager-koeln',
      merchantLocationStatus: 'ENABLED',
      locationTypes: ['WAREHOUSE'],
      location: { address: { addressLine1: 'Domstraße 1', city: 'Köln', postalCode: '50667', country: 'DE' } },
    },
  ],
};

const RECORDED_NOT_OPTED_IN = {
  errors: [
    {
      errorId: 20403,
      domain: 'API_ACCOUNT',
      category: 'REQUEST',
      message: 'User is not eligible for Business Policy.',
    },
  ],
};

function clientWith(fetchMock: unknown): EbaySetupClient {
  const client = new EbaySetupClient();
  client.bindFetch(fetchMock as typeof fetch);
  return client;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body == null ? '' : JSON.stringify(body)),
  } as Response;
}

describe('EbaySetupClient', () => {
  it('exchanges a recorded authorization code and does not echo the secret error text', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = jest.fn(async (url: URL | string, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const form = String(init?.body ?? '');
      if (form.includes('bad-code')) {
        return jsonResponse(400, { error: 'invalid_grant', error_description: 'code leaked-secret-value' });
      }
      return jsonResponse(200, RECORDED_CODE_TOKEN);
    });
    const client = clientWith(fetchMock);

    const tokens = await client.exchangeCode(
      { clientId: 'app-id', clientSecret: 'cert-secret-value', ruName: 'Markus-Ru', environment: 'production' },
      'auth-code-1',
    );
    expect(tokens.refreshToken).toBe('v^1.1#new-refresh-secret');
    const body = String(calls[0].init.body);
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('code=auth-code-1');
    expect(body).toContain('redirect_uri=Markus-Ru');
    expect(calls[0].url).toBe('https://api.ebay.com/identity/v1/oauth2/token');
    expect(String(calls[0].init.headers && JSON.stringify(calls[0].init.headers))).toContain('Basic ');
    expect(String(calls[0].init.headers && JSON.stringify(calls[0].init.headers))).not.toContain('cert-secret-value');

    await expect(
      client.exchangeCode(
        { clientId: 'app-id', clientSecret: 'cert-secret-value', ruName: 'Markus-Ru' },
        'bad-code',
      ),
    ).rejects.toThrow(EbaySellException);
    await expect(
      client.exchangeCode(
        { clientId: 'app-id', clientSecret: 'cert-secret-value', ruName: 'Markus-Ru' },
        'bad-code',
      ),
    ).rejects.toThrow(/Refresh-Token/);
    try {
      await client.exchangeCode(
        { clientId: 'app-id', clientSecret: 'cert-secret-value', ruName: 'Markus-Ru' },
        'bad-code',
      );
    } catch (error) {
      expect((error as Error).message).not.toContain('leaked-secret-value');
      expect((error as EbaySellException).tokenRejected).toBe(true);
    }
  });

  it('reads recorded policies, the pickup flag and inventory locations', async () => {
    const fetchMock = jest.fn(async (url: URL | string) => {
      const href = String(url);
      if (href.includes('/oauth2/token')) return jsonResponse(200, { access_token: 'user-access', expires_in: 7200 });
      if (href.includes('/commerce/identity/')) return jsonResponse(200, RECORDED_IDENTITY);
      if (href.includes('/fulfillment_policy')) return jsonResponse(200, RECORDED_FULFILLMENT);
      if (href.includes('/payment_policy')) return jsonResponse(200, RECORDED_PAYMENT);
      if (href.includes('/return_policy')) return jsonResponse(200, RECORDED_RETURN);
      if (href.includes('/location')) return jsonResponse(200, RECORDED_LOCATIONS);
      return jsonResponse(404, {});
    });
    const client = clientWith(fetchMock);
    const access = await client.userAccessToken(env);
    expect(access).toBe('user-access');
    const identity = await client.identity(env, access);
    expect(identity).toEqual({ userId: 'seller_de', username: 'verkauf_de' });
    const catalog = await client.loadCatalog(env, access);
    expect(catalog.optedIn).toBe(true);
    expect(catalog.catalog.fulfillmentPolicies.map((policy) => [policy.id, policy.localPickup])).toEqual([
      ['6200999000', false],
      ['6200999111', true],
    ]);
    expect(catalog.catalog.paymentPolicies[0]).toMatchObject({ id: '6200888000', name: 'Zahlung über eBay' });
    expect(catalog.catalog.returnPolicies[0]).toMatchObject({ id: '6200777000', name: 'Keine Rückgabe' });
    expect(catalog.catalog.locations[0]).toMatchObject({
      key: 'lager-koeln',
      name: 'Lager',
      city: 'Köln',
      postalCode: '50667',
      country: 'DE',
    });
    const locationCall = fetchMock.mock.calls.map((call) => String(call[0])).find((href) => href.includes('/location'));
    expect(locationCall).toContain('https://api.ebay.com/sell/inventory/v1/location');
  });

  it('turns the recorded not-opted-in error into a German hint instead of an empty success', async () => {
    const fetchMock = jest.fn(async (url: URL | string) => {
      const href = String(url);
      if (href.includes('/location')) return jsonResponse(200, RECORDED_LOCATIONS);
      return jsonResponse(400, RECORDED_NOT_OPTED_IN);
    });
    const client = clientWith(fetchMock);
    const catalog = await client.loadCatalog(env, 'user-access');
    expect(catalog.optedIn).toBe(false);
    expect(catalog.hint).toMatch(/Geschäftsrichtlinien/);
    expect(catalog.catalog.fulfillmentPolicies).toEqual([]);
    expect(catalog.catalog.locations).toEqual([
      expect.objectContaining({ key: 'lager-koeln' }),
    ]);
  });

  it('creates a location with the recorded inventory body and uses the sandbox host', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = jest.fn(async (url: URL | string, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse(204, null);
    });
    const client = clientWith(fetchMock);
    await client.createLocation(
      { ...env, environment: 'sandbox' },
      'user-access',
      { key: 'lager-ab12', name: 'Lager', street: 'Domstraße 1', postalCode: '50667', city: 'Köln', country: 'DE' },
    );
    expect(calls[0].url).toBe('https://api.sandbox.ebay.com/sell/inventory/v1/location/lager-ab12');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      name: 'Lager',
      merchantLocationStatus: 'ENABLED',
      locationTypes: ['WAREHOUSE'],
      location: {
        address: { addressLine1: 'Domstraße 1', city: 'Köln', postalCode: '50667', country: 'DE' },
      },
    });
    expect(JSON.stringify(calls[0].init.headers)).toContain('Bearer user-access');
    expect(JSON.stringify(calls[0].init.headers)).toContain('EBAY_DE');
    expect(JSON.stringify(calls)).not.toContain('stored-refresh-secret');
  });

  it('starts under Nest without a fetch provider', async () => {
    const moduleRef = await Test.createTestingModule({ providers: [EbaySetupClient] }).compile();
    expect(moduleRef.get(EbaySetupClient)).toBeInstanceOf(EbaySetupClient);
    await moduleRef.close();
  });
});
