import { MockEbayBrowseProvider } from './mock-ebay-browse.provider';

describe('MockEbayBrowseProvider', () => {
  const provider = new MockEbayBrowseProvider();

  it('returns null for empty keywords instead of a fabricated distribution', async () => {
    await expect(provider.search({ keywords: '   ', condition: 'good' })).resolves.toBeNull();
  });

  it('returns a labeled distribution for non-empty keywords', async () => {
    const result = await provider.search({ keywords: 'Nike Sneaker', condition: 'good' });
    expect(result).not.toBeNull();
    expect(result?.providerLabel).toContain('Mock');
    expect(result?.sampleSize).toBeGreaterThan(0);
  });

  it('includes comparable listing titles for description comparison (§9e-Ergänzung)', async () => {
    const result = await provider.search({ keywords: 'Nike Sneaker', condition: 'good' });
    expect(result?.comparableListings.length).toBeGreaterThan(0);
    expect(result?.comparableListings[0].title).toContain('Nike Sneaker');
  });
});
