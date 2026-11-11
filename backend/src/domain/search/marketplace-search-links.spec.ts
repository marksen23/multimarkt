import { marketplaceSearchLinks } from './marketplace-search-links';

describe('marketplaceSearchLinks', () => {
  it('returns no links for a blank query', () => {
    expect(marketplaceSearchLinks('   ', { postalCode: '50667', radiusKm: 20 })).toEqual([]);
  });

  it('builds platform search URLs for a postal code without calling those sites', () => {
    const links = marketplaceSearchLinks('Nike Air Max', { postalCode: '50667', radiusKm: 20 });
    const byPlatform = Object.fromEntries(links.map((link) => [link.platform, link]));

    expect(byPlatform.KLEINANZEIGEN.url).toBe(
      'https://www.kleinanzeigen.de/s-suchanfrage.html?keywords=Nike+Air+Max&locationStr=50667&radius=20',
    );
    expect(byPlatform.EBAY.url).toContain('https://www.ebay.de/sch/i.html?');
    expect(byPlatform.EBAY.url).toContain('_nkw=Nike+Air+Max');
    expect(byPlatform.EBAY.url).toContain('_stpos=50667');
    // 20 km liegt näher an eBays 25-km-Stufe als an 10.
    expect(byPlatform.EBAY.url).toContain('_sadis=25');
    expect(byPlatform.EBAY.url).toContain('LH_ItemCondition=4');
    expect(byPlatform.VINTED.url).toBe('https://www.vinted.de/catalog?search_text=Nike%20Air%20Max');
    expect(byPlatform.VINTED.note).toMatch(/PLZ/);
    expect(byPlatform.FACEBOOK.url).toContain('query=Nike%20Air%20Max');
  });

  it('omits a location that is not a five-digit postal code', () => {
    const links = marketplaceSearchLinks('Jacke', { postalCode: 'Berlin', radiusKm: 20 });
    expect(links[0].url).not.toContain('locationStr');
    expect(links[1].url).not.toContain('_stpos');
  });
});
