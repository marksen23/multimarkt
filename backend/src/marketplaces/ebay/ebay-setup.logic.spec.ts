import { readEbaySellEnv } from '../../domain/listing/ebay-sell-readiness';
import {
  applySelectionPatch,
  buildEbaySetupView,
  ebayLocationKey,
  planAutoSelection,
  policiesNotOptedIn,
  resolveEbayConfig,
} from './ebay-setup.logic';
import { EMPTY_EBAY_CATALOG, type EbayCatalog, type EbayConnectionRecord } from './ebay-setup.types';

const REFRESH = 'v^1.1#database-refresh-secret';
const ENV_REFRESH = 'v^1.1#environment-refresh-secret';
const SECRET_CIPHER = 'v1.iv.tag.ciphertext-not-the-token';

function record(patch: Partial<EbayConnectionRecord> = {}): EbayConnectionRecord {
  return {
    userId: '00000000-0000-0000-0000-000000000000',
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
    ...patch,
  };
}

function catalog(): EbayCatalog {
  return {
    fulfillmentPolicies: [
      { id: 'ship-1', name: 'Versand', localPickup: false },
      { id: 'pick-1', name: 'Abholung', localPickup: true },
    ],
    paymentPolicies: [{ id: 'pay-1', name: 'Zahlung', localPickup: false }],
    returnPolicies: [{ id: 'ret-1', name: 'Rückgabe', localPickup: false }],
    locations: [
      { key: 'lager-koeln', name: 'Lager', city: 'Köln', postalCode: '50667', country: 'DE', status: 'ENABLED' },
    ],
  };
}

describe('resolveEbayConfig', () => {
  it('lets the stored token and policies win and falls back to Coolify when the row is empty', () => {
    const env = readEbaySellEnv({
      get: (key) =>
        ({
          EBAY_CLIENT_ID: 'app',
          EBAY_CLIENT_SECRET: 'cert-secret-value',
          EBAY_REFRESH_TOKEN: ENV_REFRESH,
          EBAY_FULFILLMENT_POLICY_ID: 'env-ship',
          EBAY_PAYMENT_POLICY_ID: 'env-pay',
          EBAY_MERCHANT_LOCATION_KEY: 'env-lager',
        })[key],
    });
    const stored = resolveEbayConfig({
      env,
      record: record({
        refreshTokenCiphertext: SECRET_CIPHER,
        fulfillmentPolicyId: 'db-ship',
      }),
      decryptedToken: REFRESH,
      tokenUnreadable: false,
    });
    expect(stored.connectionSource).toBe('database');
    expect(stored.env.refreshToken).toBe(REFRESH);
    expect(stored.selection.fulfillmentPolicyId).toBe('db-ship');
    expect(stored.selectionSource.fulfillmentPolicyId).toBe('database');
    expect(stored.selection.paymentPolicyId).toBe('env-pay');
    expect(stored.selectionSource.paymentPolicyId).toBe('environment');
    expect(stored.selection.merchantLocationKey).toBe('env-lager');

    const fallback = resolveEbayConfig({ env, record: null, decryptedToken: null, tokenUnreadable: false });
    expect(fallback.connectionSource).toBe('environment');
    expect(fallback.env.refreshToken).toBe(ENV_REFRESH);
    expect(fallback.selection.fulfillmentPolicyId).toBe('env-ship');
  });

  it('ignores the placeholder and an unreadable stored token', () => {
    const env = readEbaySellEnv({
      get: (key) => (key === 'EBAY_REFRESH_TOKEN' ? 'unused-mock-provider-active' : ''),
    });
    const resolved = resolveEbayConfig({
      env,
      record: record({ refreshTokenCiphertext: SECRET_CIPHER }),
      decryptedToken: null,
      tokenUnreadable: true,
    });
    expect(resolved.connectionSource).toBeNull();
    expect(resolved.env.refreshToken).toBeNull();
    expect(resolved.tokenUnreadable).toBe(true);
  });
});

describe('planAutoSelection', () => {
  it('selects a single policy or location and a single pickup policy, and leaves a choice alone', () => {
    const resolved = resolveEbayConfig({
      env: readEbaySellEnv({ get: () => '' }),
      record: null,
      decryptedToken: null,
      tokenUnreadable: false,
    });
    const plan = planAutoSelection(resolved, catalog());
    expect(plan.fields.sort()).toEqual(['merchantLocationKey', 'paymentPolicyId', 'pickupFulfillmentPolicyId', 'returnPolicyId']);
    expect(plan.patch.fulfillmentPolicyId).toBeUndefined();
    expect(plan.patch.pickupFulfillmentPolicyId).toBe('pick-1');
    expect(plan.patch.paymentPolicyId).toBe('pay-1');
    expect(plan.patch.merchantLocationKey).toBe('lager-koeln');

    const onlyShip: EbayCatalog = {
      ...EMPTY_EBAY_CATALOG,
      fulfillmentPolicies: [{ id: 'ship-only', name: 'Versand', localPickup: false }],
    };
    expect(planAutoSelection(resolved, onlyShip).patch.fulfillmentPolicyId).toBe('ship-only');
    expect(planAutoSelection(resolved, onlyShip).patch.pickupFulfillmentPolicyId).toBeUndefined();
  });

  it('does not overwrite a Coolify value', () => {
    const resolved = resolveEbayConfig({
      env: readEbaySellEnv({ get: (key) => (key === 'EBAY_PAYMENT_POLICY_ID' ? 'env-pay' : '') }),
      record: null,
      decryptedToken: null,
      tokenUnreadable: false,
    });
    const plan = planAutoSelection(resolved, catalog());
    expect(plan.fields).not.toContain('paymentPolicyId');
    const applied = applySelectionPatch(resolved, plan.patch);
    expect(applied.selection.paymentPolicyId).toBe('env-pay');
    expect(applied.selectionSource.returnPolicyId).toBe('database');
    expect(applied.selection.returnPolicyId).toBe('ret-1');
  });
});

describe('buildEbaySetupView', () => {
  it('describes the steps data without copying tokens or the ciphertext', () => {
    const resolved = resolveEbayConfig({
      env: readEbaySellEnv({
        get: (key) =>
          ({
            EBAY_CLIENT_ID: 'app-id',
            EBAY_CLIENT_SECRET: 'cert-secret-value',
            EBAY_ENVIRONMENT: 'production',
          })[key],
      }),
      record: record({
        refreshTokenCiphertext: SECRET_CIPHER,
        refreshTokenExpiresAt: new Date('2026-12-01T00:00:00Z'),
        ebayUsername: 'verkauf_de',
      }),
      decryptedToken: REFRESH,
      tokenUnreadable: false,
    });
    const view = buildEbaySetupView({
      publicBaseUrl: 'https://resale.example.com',
      ruName: 'Markus-Ru',
      encryptionReady: true,
      resolved,
      username: 'verkauf_de',
      catalog: catalog(),
      policiesOptedIn: true,
      policiesHint: null,
      catalogError: null,
      health: 'ok',
      healthMessage: null,
      autoSelected: [],
      now: new Date('2026-11-27T00:00:00Z'),
    });
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(REFRESH);
    expect(serialized).not.toContain('cert-secret-value');
    expect(serialized).not.toContain(SECRET_CIPHER);
    expect(view.connected).toBe(true);
    expect(view.connectionSource).toBe('database');
    expect(view.username).toBe('verkauf_de');
    expect(view.oauthReady).toBe(true);
    expect(view.callbackUrl).toBe('https://resale.example.com/api/system/ebay/callback');
    expect(view.refreshExpiresSoon).toBe(true);
    expect(view.publishReady).toBe(false);
    expect(view.publishMissing.join(' ')).toContain('Einrichtung');
  });
});

describe('ebay location key and policy errors', () => {
  it('slugifies a German name and recognizes the recorded opt-in error', () => {
    expect(ebayLocationKey('Lager Köln', 0xab12)).toBe('lager-koln-ab12');
    expect(policiesNotOptedIn(400, { errors: [{ errorId: 20403, message: 'User is not eligible for Business Policy.' }] })).toBe(
      true,
    );
    expect(policiesNotOptedIn(200, { fulfillmentPolicies: [] })).toBe(false);
  });
});
