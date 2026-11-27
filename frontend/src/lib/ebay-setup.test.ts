import { describe, expect, it } from 'vitest';
import type { EbaySetupView } from '../api/types';
import { ebayReturnNotice, ebaySetupSteps, isEbayAuthorizeUrl, sourceLabel } from './ebay-setup';

function view(patch: Partial<EbaySetupView> = {}): EbaySetupView {
  return {
    environment: 'production',
    environmentInvalid: false,
    callbackUrl: 'https://resale.example.com/api/system/ebay/callback',
    clientIdReady: false,
    clientSecretReady: false,
    ruNameReady: false,
    encryptionReady: true,
    oauthReady: false,
    connected: false,
    connectionSource: null,
    username: null,
    refreshExpiresAt: null,
    refreshExpired: false,
    refreshExpiresSoon: false,
    health: 'unknown',
    healthMessage: null,
    tokenUnreadable: false,
    policiesOptedIn: null,
    policiesHint: null,
    catalogError: null,
    fulfillmentPolicies: [],
    paymentPolicies: [],
    returnPolicies: [],
    locations: [],
    selection: {
      fulfillmentPolicyId: null,
      paymentPolicyId: null,
      returnPolicyId: null,
      pickupFulfillmentPolicyId: null,
      merchantLocationKey: null,
    },
    selectionSource: {
      fulfillmentPolicyId: null,
      paymentPolicyId: null,
      returnPolicyId: null,
      pickupFulfillmentPolicyId: null,
      merchantLocationKey: null,
    },
    autoSelected: [],
    publishReady: false,
    publishMissing: [],
    ...patch,
  };
}

describe('ebaySetupSteps', () => {
  it('starts at the app keys and ends ready only when publishing is ready', () => {
    expect(ebaySetupSteps(view()).map((step) => [step.label, step.state])).toEqual([
      ['App-Schlüssel', 'current'],
      ['eBay-Konto verbunden', 'todo'],
      ['Geschäftsrichtlinien und Standort', 'todo'],
      ['Bereit zum Einstellen', 'todo'],
    ]);

    const ready = ebaySetupSteps(
      view({
        clientIdReady: true,
        clientSecretReady: true,
        ruNameReady: true,
        connected: true,
        health: 'ok',
        selection: {
          fulfillmentPolicyId: 'ship',
          paymentPolicyId: 'pay',
          returnPolicyId: 'ret',
          pickupFulfillmentPolicyId: null,
          merchantLocationKey: 'lager',
        },
        publishReady: true,
      }),
    );
    expect(ready.every((step) => step.state === 'done')).toBe(true);
  });

  it('keeps the account step open when eBay rejected the token', () => {
    const steps = ebaySetupSteps(
      view({
        clientIdReady: true,
        clientSecretReady: true,
        ruNameReady: true,
        connected: true,
        health: 'error',
      }),
    );
    expect(steps.find((step) => step.id === 'account')?.state).toBe('current');
  });
});

describe('ebayReturnNotice', () => {
  it('maps known results and does not echo an unknown reason', () => {
    expect(ebayReturnNotice(new URLSearchParams('ebay=verbunden'))?.text).toMatch(/verbunden/);
    expect(ebayReturnNotice(new URLSearchParams('ebay=fehler&grund=abgelehnt'))?.text).toMatch(/abgelehnt/);
    const hostile = ebayReturnNotice(new URLSearchParams('ebay=fehler&grund=<script>alert(1)</script>'));
    expect(hostile?.text).toMatch(/nicht geklappt/);
    expect(hostile?.text).not.toContain('script');
    expect(ebayReturnNotice(new URLSearchParams(''))).toBeNull();
  });
});

describe('isEbayAuthorizeUrl', () => {
  it('allows only the eBay consent hosts', () => {
    expect(isEbayAuthorizeUrl('https://auth.ebay.com/oauth2/authorize?client_id=app')).toBe(true);
    expect(isEbayAuthorizeUrl('https://auth.sandbox.ebay.com/oauth2/authorize')).toBe(true);
    expect(isEbayAuthorizeUrl('https://evil.example/oauth2/authorize')).toBe(false);
    expect(isEbayAuthorizeUrl('http://auth.ebay.com/oauth2/authorize')).toBe(false);
    expect(sourceLabel('database')).toBe('Gespeichert in der App');
    expect(sourceLabel('environment')).toBe('Aus Coolify');
  });
});
