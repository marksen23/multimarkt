import { shouldCallMarketplaceDelist } from './marketplace-publishing.service';

describe('shouldCallMarketplaceDelist', () => {
  it('does not call a delete API for the copy-and-confirm channels, including the mock eBay id', () => {
    expect(shouldCallMarketplaceDelist('EBAY', 'ebay-mock-123')).toBe(false);
    expect(shouldCallMarketplaceDelist('KLEINANZEIGEN', null)).toBe(false);
    expect(shouldCallMarketplaceDelist('VINTED', 'vinted-1')).toBe(false);
  });

  it('still allows a real adapter delist for a marketplace that is not copy-and-confirm', () => {
    expect(shouldCallMarketplaceDelist('OTHER', 'ext-1')).toBe(true);
  });
});
