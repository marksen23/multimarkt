import { MockEbayBrowseProvider } from './mock-ebay-browse.provider';

describe('MockEbayBrowseProvider', () => {
  const provider = new MockEbayBrowseProvider();

  it('returns null instead of a fabricated price distribution', async () => {
    await expect(provider.search({ keywords: '   ', condition: 'good' })).resolves.toBeNull();
    await expect(provider.search({ keywords: 'Nike Sneaker', condition: 'good' })).resolves.toBeNull();
  });
});
