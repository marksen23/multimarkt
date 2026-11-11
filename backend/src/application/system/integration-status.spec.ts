import { integrationStatus, isRealSecret } from './integration-status';

describe('integrationStatus', () => {
  it('treats an empty value and the placeholder as not a real key', () => {
    expect(isRealSecret('')).toBe(false);
    expect(isRealSecret('  ')).toBe(false);
    expect(isRealSecret('unused-mock-provider-active')).toBe(false);
    expect(isRealSecret(null)).toBe(false);
    expect(isRealSecret('real-key')).toBe(true);
  });

  it('requires both eBay values and never reports a live buyback portal', () => {
    expect(
      integrationStatus({
        geminiApiKey: 'gemini',
        ebayClientId: 'id',
        ebayClientSecret: '',
        s3Bucket: 'bucket',
      }),
    ).toEqual({
      geminiLive: true,
      ebayLive: false,
      photoStorageDurable: true,
      buybackLive: false,
    });
  });
});
