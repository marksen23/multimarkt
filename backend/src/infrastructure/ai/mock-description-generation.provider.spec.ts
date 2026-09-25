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
