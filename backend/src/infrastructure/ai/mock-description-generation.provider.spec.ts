import { MockDescriptionGenerationProvider } from './mock-description-generation.provider';

describe('MockDescriptionGenerationProvider', () => {
  it('builds the plain template from title and condition', async () => {
    const provider = new MockDescriptionGenerationProvider();
    const result = await provider.generate({ title: 'Herrenjacke', condition: 'good', attributes: [] });

    expect(result).toBe('Herrenjacke — Zustand: good');
  });

  it('falls back to generic placeholders when title/condition are unknown', async () => {
    const provider = new MockDescriptionGenerationProvider();
    const result = await provider.generate({ title: null, condition: null, attributes: [] });

    expect(result).toBe('Artikel — Zustand: unbekannt');
  });
});
