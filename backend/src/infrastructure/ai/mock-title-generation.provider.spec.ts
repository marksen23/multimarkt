import { MockTitleGenerationProvider } from './mock-title-generation.provider';

describe('MockTitleGenerationProvider', () => {
  it('builds a plain title from title and condition', async () => {
    const provider = new MockTitleGenerationProvider();
    const result = await provider.generate({
      title: 'Herrenjacke',
      condition: 'good',
      attributes: [],
      channel: 'KLEINANZEIGEN',
      comparableListings: [],
    });

    expect(result).toBe('Herrenjacke good');
  });

  it('falls back to a generic placeholder when the title is unknown', async () => {
    const provider = new MockTitleGenerationProvider();
    const result = await provider.generate({
      title: null,
      condition: null,
      attributes: [],
      channel: 'KLEINANZEIGEN',
      comparableListings: [],
    });

    expect(result).toBe('Artikel');
  });

  it('truncates to the channel character limit', async () => {
    const provider = new MockTitleGenerationProvider();
    const result = await provider.generate({
      title: 'X'.repeat(100),
      condition: null,
      attributes: [],
      channel: 'KLEINANZEIGEN',
      comparableListings: [],
    });

    expect(result?.length).toBe(65);
  });
});
