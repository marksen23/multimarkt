import { ConfigService } from '@nestjs/config';
import { EbaySellException } from '../../domain/errors/ebay-sell.exception';
import { decryptEbayToken } from '../../marketplaces/ebay/ebay-token-cipher';
import type { EbayCatalogResult, EbaySetupClient } from '../../marketplaces/ebay/ebay-setup.client';
import type { EbayCatalog, EbayConnectionRecord } from '../../marketplaces/ebay/ebay-setup.types';
import { EbaySetupService } from './ebay-setup.service';
import { EbaySetupStore } from './ebay-setup.store';

const USER = '00000000-0000-0000-0000-000000000000';
const SECRET = 'jwt-secret-for-tests';
const DB_REFRESH = 'v^1.1#database-refresh-secret';
const ENV_REFRESH = 'v^1.1#environment-refresh-secret';

function emptyRecord(): EbayConnectionRecord {
  return {
    userId: USER,
    refreshTokenCiphertext: null,
    refreshTokenExpiresAt: null,
    ebayUserId: null,
    ebayUsername: null,
    connectedAt: null,
    health: 'unknown',
    healthMessage: null,
    healthCheckedAt: null,
    fulfillmentPolicyId: null,
    paymentPolicyId: null,
    returnPolicyId: null,
    pickupFulfillmentPolicyId: null,
    merchantLocationKey: null,
  };
}

class MemoryStore extends EbaySetupStore {
  row: EbayConnectionRecord | null = null;
  states = new Map<string, Date>();

  async getConnection(): Promise<EbayConnectionRecord | null> {
    return this.row ? { ...this.row } : null;
  }

  async saveConnection(userId: string, patch: Partial<EbayConnectionRecord>): Promise<EbayConnectionRecord> {
    if (patch.refreshTokenCiphertext && !patch.refreshTokenCiphertext.startsWith('v1.')) {
      throw new Error('Refusing to store an unencrypted eBay token.');
    }
    this.row = { ...(this.row ?? emptyRecord()), ...patch, userId };
    return { ...this.row };
  }

  async clearToken(): Promise<void> {
    if (!this.row) return;
    this.row = {
      ...this.row,
      refreshTokenCiphertext: null,
      refreshTokenExpiresAt: null,
      ebayUserId: null,
      ebayUsername: null,
      connectedAt: null,
      health: 'unknown',
      healthMessage: null,
      healthCheckedAt: null,
    };
  }

  async putState(hash: string, expiresAt: Date): Promise<void> {
    this.states.set(hash, expiresAt);
  }

  async consumeState(hash: string, now: Date): Promise<boolean> {
    const expires = this.states.get(hash);
    if (!expires) return false;
    this.states.delete(hash);
    return expires.getTime() >= now.getTime();
  }
}

function catalog(patch: Partial<EbayCatalog> = {}): EbayCatalog {
  return {
    fulfillmentPolicies: [{ id: 'ship-1', name: 'Versand', localPickup: false }],
    paymentPolicies: [{ id: 'pay-1', name: 'Zahlung', localPickup: false }],
    returnPolicies: [{ id: 'ret-1', name: 'Rückgabe', localPickup: false }],
    locations: [{ key: 'lager-koeln', name: 'Lager', city: 'Köln', postalCode: '50667', country: 'DE', status: 'ENABLED' }],
    ...patch,
  };
}

function serviceFor(options?: { env?: Record<string, string>; catalog?: EbayCatalogResult }) {
  const values: Record<string, string> = {
    APP_USER_ID: USER,
    JWT_SECRET: SECRET,
    EBAY_CLIENT_ID: 'app-id',
    EBAY_CLIENT_SECRET: 'cert-secret-value',
    EBAY_RU_NAME: 'Markus-Ru',
    PUBLIC_BASE_URL: 'https://resale.example.com',
    EBAY_REFRESH_TOKEN: ENV_REFRESH,
    EBAY_FULFILLMENT_POLICY_ID: 'env-ship',
    ...options?.env,
  };
  const store = new MemoryStore();
  const client = {
    exchangeCode: jest.fn(async () => ({
      accessToken: 'access-token-value',
      expiresIn: 7200,
      refreshToken: DB_REFRESH,
      refreshExpiresIn: 47304000,
    })),
    userAccessToken: jest.fn(async () => 'access-token-value'),
    identity: jest.fn(async () => ({ userId: 'seller_de', username: 'verkauf_de' })),
    loadCatalog: jest.fn(
      async (): Promise<EbayCatalogResult> =>
        options?.catalog ?? { optedIn: true, hint: null, catalog: catalog() },
    ),
    createLocation: jest.fn(async (_env: unknown, _access: string, _draft: { key: string }) => undefined),
  };
  const ebay = new EbaySetupService(
    { get: (key: string) => values[key] } as unknown as ConfigService,
    store,
    client as unknown as EbaySetupClient,
  );
  return { ebay, store, client, values };
}

describe('EbaySetupService', () => {
  it('starts OAuth with a signed state and stores only its hash', async () => {
    const { ebay, store } = serviceFor({ env: { EBAY_REFRESH_TOKEN: '' } });
    const { authorizeUrl } = await ebay.beginConnect();
    const url = new URL(authorizeUrl);
    expect(url.origin).toBe('https://auth.ebay.com');
    expect(url.searchParams.get('redirect_uri')).toBe('Markus-Ru');
    expect(url.searchParams.get('client_id')).toBe('app-id');
    const state = url.searchParams.get('state') ?? '';
    expect(store.states.size).toBe(1);
    expect([...store.states.keys()][0]).toHaveLength(64);
    expect(authorizeUrl).not.toContain(SECRET);
    expect(authorizeUrl).not.toContain('cert-secret-value');

    const bad = await ebay.completeCallback({ code: 'code-1', state: `${state}tampered` });
    expect(bad).toBe('https://resale.example.com/einrichtung?ebay=fehler&grund=abgelaufen');
    expect(store.row).toBeNull();
  });

  it('stores an encrypted refresh token and never returns it', async () => {
    const { ebay, store, client } = serviceFor();
    const { authorizeUrl } = await ebay.beginConnect();
    const state = new URL(authorizeUrl).searchParams.get('state');
    const target = await ebay.completeCallback({ code: 'auth-code-1', state });
    expect(target).toBe('https://resale.example.com/einrichtung?ebay=verbunden');
    expect(target).not.toContain('auth-code-1');
    expect(target).not.toContain(DB_REFRESH);
    expect(store.row?.refreshTokenCiphertext?.startsWith('v1.')).toBe(true);
    expect(store.row?.refreshTokenCiphertext).not.toContain(DB_REFRESH);
    expect(decryptEbayToken(store.row!.refreshTokenCiphertext!, SECRET)).toBe(DB_REFRESH);
    expect(store.row?.ebayUsername).toBe('verkauf_de');
    expect(client.exchangeCode).toHaveBeenCalledTimes(1);

    const again = await ebay.completeCallback({ code: 'auth-code-1', state });
    expect(again).toContain('grund=abgelaufen');
    expect(client.exchangeCode).toHaveBeenCalledTimes(1);

    const view = await ebay.status();
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(DB_REFRESH);
    expect(serialized).not.toContain(ENV_REFRESH);
    expect(serialized).not.toContain('cert-secret-value');
    expect(serialized).not.toContain(store.row?.refreshTokenCiphertext);
    expect(view.connectionSource).toBe('database');
    expect(view.username).toBe('verkauf_de');
    expect(view.health).toBe('ok');
    expect(view.selection.fulfillmentPolicyId).toBe('env-ship');
    expect(view.selectionSource.fulfillmentPolicyId).toBe('environment');
    expect(view.autoSelected).not.toContain('fulfillmentPolicyId');
    expect(view.selection.paymentPolicyId).toBe('pay-1');
    expect(view.selectionSource.paymentPolicyId).toBe('database');
    expect(view.autoSelected).toEqual(
      expect.arrayContaining(['paymentPolicyId', 'returnPolicyId', 'merchantLocationKey']),
    );
    expect(view.publishReady).toBe(true);
  });

  it('keeps the Coolify token as fallback after disconnect and does not invent policies', async () => {
    const { ebay, client } = serviceFor({
      catalog: {
        optedIn: false,
        hint: 'Geschäftsrichtlinien sind auf diesem eBay-Konto noch nicht aktiv.',
        catalog: {
          fulfillmentPolicies: [],
          paymentPolicies: [],
          returnPolicies: [],
          locations: [],
        },
      },
    });
    const { authorizeUrl } = await ebay.beginConnect();
    await ebay.completeCallback({ code: 'auth-code-1', state: new URL(authorizeUrl).searchParams.get('state') });
    const disconnected = await ebay.disconnect();
    expect(disconnected.connectionSource).toBe('environment');
    expect(disconnected.policiesOptedIn).toBe(false);
    expect(disconnected.policiesHint).toMatch(/Geschäftsrichtlinien/);
    expect(disconnected.selection.fulfillmentPolicyId).toBe('env-ship');
    expect(disconnected.selectionSource.fulfillmentPolicyId).toBe('environment');
    expect(JSON.stringify(disconnected)).not.toContain(ENV_REFRESH);
    expect(client.userAccessToken).toHaveBeenCalled();
  });

  it('clears saved policies when a different eBay account connects', async () => {
    const { ebay, store, client } = serviceFor();
    const { authorizeUrl } = await ebay.beginConnect();
    await ebay.completeCallback({ code: 'auth-code-1', state: new URL(authorizeUrl).searchParams.get('state') });
    await ebay.saveSelection({
      fulfillmentPolicyId: 'ship-1',
      paymentPolicyId: 'pay-1',
      returnPolicyId: 'ret-1',
      merchantLocationKey: 'lager-koeln',
    });
    expect(store.row?.fulfillmentPolicyId).toBe('ship-1');

    client.identity.mockResolvedValueOnce({ userId: 'other_seller', username: 'anderes_konto' });
    const { authorizeUrl: nextUrl } = await ebay.beginConnect();
    await ebay.completeCallback({ code: 'auth-code-2', state: new URL(nextUrl).searchParams.get('state') });
    expect(store.row?.ebayUserId).toBe('other_seller');
    expect(store.row?.fulfillmentPolicyId).toBeNull();
    expect(store.row?.merchantLocationKey).toBeNull();
  });

  it('rejects an unknown policy and creates a location from the form', async () => {
    const { ebay, store, client } = serviceFor();
    await expect(ebay.saveSelection({ fulfillmentPolicyId: 'missing' })).rejects.toBeInstanceOf(EbaySellException);

    const view = await ebay.createLocation({
      name: 'Lager Köln',
      street: 'Domstraße 1',
      postalCode: '50667',
      city: 'Köln',
    });
    expect(client.createLocation).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'app-id' }),
      'access-token-value',
      expect.objectContaining({
        name: 'Lager Köln',
        street: 'Domstraße 1',
        postalCode: '50667',
        city: 'Köln',
        country: 'DE',
      }),
    );
    const draft = client.createLocation.mock.calls[0][2];
    expect(draft.key).toMatch(/^lager-koln-[0-9a-f]{4}$/);
    expect(store.row?.merchantLocationKey).toBe(draft.key);
    expect(view.selection.merchantLocationKey).toBe(draft.key);
    expect(JSON.stringify(view)).not.toContain(ENV_REFRESH);

    await expect(
      ebay.createLocation({ name: 'Lager', street: 'Weg 1', postalCode: '1234', city: 'Köln' }),
    ).rejects.toThrow(/fünf Ziffern/);
  });

  it('does not call eBay when the state was refused or the seller denied access', async () => {
    const { ebay, client } = serviceFor();
    const denied = await ebay.completeCallback({ error: 'access_denied' });
    expect(denied).toContain('grund=abgelehnt');
    expect(client.exchangeCode).not.toHaveBeenCalled();

    await expect(ebay.beginConnect()).resolves.toBeTruthy();
    const missing = serviceFor({ env: { EBAY_RU_NAME: '' } });
    await expect(missing.ebay.beginConnect()).rejects.toThrow(/EBAY_RU_NAME/);
  });
});
