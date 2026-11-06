import { MockDescriptionGenerationProvider } from './mock-description-generation.provider';

describe('MockDescriptionGenerationProvider', () => {
  it('builds the plain template from title and condition', async () => {
    const provider = new MockDescriptionGenerationProvider();
    const result = await provider.generate({
      title: 'Herrenjacke',
      condition: 'good',
      attributes: [],
      comparableListings: [],
      salesGoal: null,
    });

    expect(result).toBe('Herrenjacke — Zustand: good');
  });

  it('falls back to generic placeholders when title/condition are unknown', async () => {
    const provider = new MockDescriptionGenerationProvider();
    const result = await provider.generate({
      title: null,
      condition: null,
      attributes: [],
      comparableListings: [],
      salesGoal: null,
    });

    expect(result).toBe('Artikel — Zustand: unbekannt');
  });

  it('writes a different text for each channel and does not invent a postal code', async () => {
    const provider = new MockDescriptionGenerationProvider();
    const shared = {
      title: 'Nike Laufschuhe',
      condition: 'good',
      attributes: [
        { key: 'brand', value: 'Nike' },
        { key: 'size', value: '42' },
        { key: 'color', value: 'Schwarz' },
        { key: 'material', value: 'Mesh' },
      ],
      comparableListings: [],
      salesGoal: null,
      missingTokens: ['mesh', 'ovp'],
    };

    const klein = await provider.generate({ ...shared, channel: 'KLEINANZEIGEN' });
    const ebay = await provider.generate({ ...shared, channel: 'EBAY' });
    const vinted = await provider.generate({ ...shared, channel: 'VINTED' });

    expect(klein).not.toBe(ebay);
    expect(ebay).not.toBe(vinted);
    expect(klein).toContain('Du kannst den Artikel abholen');
    expect(klein).toContain('PLZ: (bitte eintragen)');
    expect(klein).not.toMatch(/\b\d{5}\b/);
    expect(ebay?.startsWith('Nike')).toBe(true);
    expect(ebay).toContain('Lieferumfang:');
    expect(ebay).toContain('Zustand:');
    expect(vinted).toContain('Farbe Schwarz');
    expect(vinted).toContain('Größe 42');
    expect(vinted).toContain('Maße:');
    expect(klein?.toLowerCase()).toContain('mesh');
    expect(klein?.toLowerCase()).not.toContain('ovp');
  });

  it('ignores comparableListings/salesGoal — the mock is a plain template, not AI', async () => {
    const provider = new MockDescriptionGenerationProvider();
    const result = await provider.generate({
      title: 'Herrenjacke',
      condition: 'good',
      attributes: [],
      comparableListings: [{ title: 'Andere Jacke', price: 40 }],
      salesGoal: 'FAST_SALE',
    });

    expect(result).toBe('Herrenjacke — Zustand: good');
  });
});
