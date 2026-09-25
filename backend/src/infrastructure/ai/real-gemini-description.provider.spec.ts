import { ConfigService } from '@nestjs/config';

const generateContentMock = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

import { RealGeminiDescriptionProvider } from './real-gemini-description.provider';

function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('RealGeminiDescriptionProvider', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
  });

  it('returns the trimmed generated text and includes only known attributes in the prompt', async () => {
    generateContentMock.mockResolvedValue({ text: '  Tolle Lederjacke in gutem Zustand.  ' });

    const provider = new RealGeminiDescriptionProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.generate({
      title: 'Herrenjacke',
      condition: 'good',
      attributes: [
        { key: 'brand', value: null },
        { key: 'material', value: 'Leder' },
      ],
      comparableListings: [],
      salesGoal: null,
    });

    expect(result).toBe('Tolle Lederjacke in gutem Zustand.');
    const prompt = generateContentMock.mock.calls[0][0].contents as string;
    expect(prompt).toContain('material: Leder');
    expect(prompt).not.toContain('brand: null');
  });

  it('returns null instead of an empty string when Gemini has nothing to say', async () => {
    generateContentMock.mockResolvedValue({ text: '' });

    const provider = new RealGeminiDescriptionProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.generate({
      title: 'Artikel',
      condition: null,
      attributes: [],
      comparableListings: [],
      salesGoal: null,
    });

    expect(result).toBeNull();
  });

  it('includes comparable listings only as style reference, never as a fact source', async () => {
    generateContentMock.mockResolvedValue({ text: 'Text' });

    const provider = new RealGeminiDescriptionProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    await provider.generate({
      title: 'Herrenjacke',
      condition: 'good',
      attributes: [],
      comparableListings: [{ title: 'Ähnliche Jacke, kaum getragen', price: 45 }],
      salesGoal: null,
    });

    const prompt = generateContentMock.mock.calls[0][0].contents as string;
    expect(prompt).toContain('Ähnliche Jacke, kaum getragen');
    expect(prompt).toContain('NICHT als Faktenquelle');
  });

  it('adds the matching tone instruction for the given sales goal', async () => {
    generateContentMock.mockResolvedValue({ text: 'Text' });

    const provider = new RealGeminiDescriptionProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    await provider.generate({
      title: 'Herrenjacke',
      condition: 'good',
      attributes: [],
      comparableListings: [],
      salesGoal: 'FAST_SALE',
    });

    const prompt = generateContentMock.mock.calls[0][0].contents as string;
    expect(prompt).toContain('schneller Verkauf');
  });
});
