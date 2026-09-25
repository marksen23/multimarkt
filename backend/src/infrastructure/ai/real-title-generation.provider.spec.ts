import { ConfigService } from '@nestjs/config';

const generateContentMock = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

import { RealTitleGenerationProvider } from './real-title-generation.provider';

function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('RealTitleGenerationProvider', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
  });

  it('returns the trimmed generated title', async () => {
    generateContentMock.mockResolvedValue({ text: '  Herrenjacke Leder gut  ' });

    const provider = new RealTitleGenerationProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.generate({
      title: 'Herrenjacke',
      condition: 'good',
      attributes: [{ key: 'material', value: 'Leder' }],
      channel: 'KLEINANZEIGEN',
      comparableListings: [],
    });

    expect(result).toBe('Herrenjacke Leder gut');
  });

  it('returns null instead of an empty string when Gemini has nothing to say', async () => {
    generateContentMock.mockResolvedValue({ text: '' });

    const provider = new RealTitleGenerationProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.generate({
      title: 'Artikel',
      condition: null,
      attributes: [],
      channel: 'KLEINANZEIGEN',
      comparableListings: [],
    });

    expect(result).toBeNull();
  });

  it('truncates the result to the channel character limit', async () => {
    generateContentMock.mockResolvedValue({ text: 'X'.repeat(100) });

    const provider = new RealTitleGenerationProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.generate({
      title: 'Artikel',
      condition: null,
      attributes: [],
      channel: 'KLEINANZEIGEN',
      comparableListings: [],
    });

    expect(result?.length).toBe(65);
  });

  it('includes comparable titles only as vocabulary reference, never as a fact source', async () => {
    generateContentMock.mockResolvedValue({ text: 'Titel' });

    const provider = new RealTitleGenerationProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    await provider.generate({
      title: 'Herrenjacke',
      condition: 'good',
      attributes: [],
      channel: 'KLEINANZEIGEN',
      comparableListings: [{ title: 'Ähnliche Jacke OVP', price: 45 }],
    });

    const prompt = generateContentMock.mock.calls[0][0].contents as string;
    expect(prompt).toContain('Ähnliche Jacke OVP');
    expect(prompt).toContain('NICHT als Faktenquelle');
  });
});
