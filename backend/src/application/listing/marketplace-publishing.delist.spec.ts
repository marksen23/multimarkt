import { shouldCallMarketplaceDelist } from './marketplace-publishing.service';

describe('shouldCallMarketplaceDelist', () => {
  it('does not call a delete API for copy-and-confirm channels or an invented eBay id', () => {
    expect(shouldCallMarketplaceDelist('EBAY', 'ebay-mock-123', { offerId: 'offer-1' })).toBe(false);
    expect(shouldCallMarketplaceDelist('EBAY', '123456789012', {})).toBe(false);
    expect(shouldCallMarketplaceDelist('KLEINANZEIGEN', null)).toBe(false);
    expect(shouldCallMarketplaceDelist('VINTED', 'vinted-1')).toBe(false);
  });

  it('withdraws an eBay offer only when the publish stored an offer id', () => {
    expect(shouldCallMarketplaceDelist('EBAY', '123456789012', { offerId: 'offer-9' })).toBe(true);
  });

  it('still allows a real adapter delist for a marketplace that is not copy-and-confirm', () => {
    expect(shouldCallMarketplaceDelist('OTHER', 'ext-1')).toBe(true);
  });
});
