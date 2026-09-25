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
    });

    expect(result).toBe('Tolle Lederjacke in gutem Zustand.');
    const prompt = generateContentMock.mock.calls[0][0].contents as string;
    expect(prompt).toContain('material: Leder');
    expect(prompt).not.toContain('brand: null');
  });

  it('returns null instead of an empty string when Gemini has nothing to say', async () => {
    generateContentMock.mockResolvedValue({ text: '' });

    const provider = new RealGeminiDescriptionProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.generate({ title: 'Artikel', condition: null, attributes: [] });

    expect(result).toBeNull();
  });
});
