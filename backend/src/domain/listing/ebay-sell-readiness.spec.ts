import { ebayApiHost, ebaySellGaps, fulfillmentPolicyId } from './ebay-sell-readiness';

const complete = {
  clientId: 'app',
  clientSecret: 'cert',
  refreshToken: 'refresh',
  fulfillmentPolicyId: 'ship',
  paymentPolicyId: 'pay',
  returnPolicyId: 'ret',
  merchantLocationKey: 'lager',
};

describe('ebaySellGaps', () => {
  it('is ready only when the user token and the business policies are set', () => {
    expect(ebaySellGaps(complete)).toEqual([]);
  });

  it('names every missing sell setting in German and ignores the browse placeholder', () => {
    const gaps = ebaySellGaps({
      clientId: 'unused-mock-provider-active',
      clientSecret: '',
      environment: 'nope',
    });
    const keys = gaps.map((gap) => gap.key);
    expect(keys).toEqual([
      'EBAY_CLIENT_ID',
      'EBAY_CLIENT_SECRET',
      'EBAY_REFRESH_TOKEN',
      'EBAY_FULFILLMENT_POLICY_ID',
      'EBAY_PAYMENT_POLICY_ID',
      'EBAY_RETURN_POLICY_ID',
      'EBAY_MERCHANT_LOCATION_KEY',
      'EBAY_ENVIRONMENT',
    ]);
    expect(gaps.every((gap) => /eBay|EBAY_/.test(gap.message))).toBe(true);
    expect(gaps.map((gap) => gap.message).join(' ')).not.toMatch(/mock|placeholder/i);
  });

  it('asks for a pickup policy only when the article is pickup-only', () => {
    expect(ebaySellGaps(complete).some((gap) => gap.key === 'EBAY_PICKUP_FULFILLMENT_POLICY_ID')).toBe(false);
    const pickup = ebaySellGaps(complete, { pickupOnly: true });
    expect(pickup.map((gap) => gap.key)).toEqual(['EBAY_PICKUP_FULFILLMENT_POLICY_ID']);
    expect(pickup[0].message).toMatch(/Abholung/);
  });

  it('uses the pickup policy for pickup articles and production by default', () => {
    expect(fulfillmentPolicyId({ ...complete, pickupFulfillmentPolicyId: 'abholung' }, true)).toBe('abholung');
    expect(fulfillmentPolicyId(complete, false)).toBe('ship');
    expect(ebayApiHost(undefined)).toBe('https://api.ebay.com');
    expect(ebayApiHost('sandbox')).toBe('https://api.sandbox.ebay.com');
  });
});
