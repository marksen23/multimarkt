import { MockMomoxProvider } from './mock-momox.provider';

describe('MockMomoxProvider', () => {
  const provider = new MockMomoxProvider();

  it('returns null without a brand instead of guessing an anchor price', async () => {
    await expect(provider.quote({ brand: null, category: 'Sneaker' })).resolves.toBeNull();
  });

  it('returns a labeled quote when a brand is known', async () => {
    const result = await provider.quote({ brand: 'Nike', category: 'Sneaker' });
    expect(result).not.toBeNull();
    expect(result?.portalName).toContain('Mock');
    expect(result?.buybackPrice).toBeGreaterThan(0);
  });
});
