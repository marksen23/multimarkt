import { EBAY_MISSING_KEYS_MESSAGE } from '../../domain/pricing/market-search-error';
import { MockEbayBrowseProvider } from './mock-ebay-browse.provider';

describe('MockEbayBrowseProvider', () => {
  const provider = new MockEbayBrowseProvider();

  it('returns null for an empty query and names the missing keys otherwise', async () => {
    await expect(provider.search({ keywords: '   ', condition: 'good' })).resolves.toBeNull();
    await expect(provider.search({ keywords: 'Nike Sneaker', condition: 'good' })).rejects.toThrow(
      EBAY_MISSING_KEYS_MESSAGE,
    );
  });
});
