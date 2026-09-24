import { ConfigService } from '@nestjs/config';

const generateContentMock = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

// Import erst NACH dem jest.mock oben, damit die gemockte Klasse greift.
import { RealGeminiVisionProvider } from './real-gemini-vision.provider';

function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('RealGeminiVisionProvider', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    generateContentMock.mockReset();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'image/jpeg']]),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }) as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns all-UNKNOWN claims without calling Gemini when no images are given', async () => {
    const provider = new RealGeminiVisionProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.analyzeItem({ imageUrls: [] });

    expect(generateContentMock).not.toHaveBeenCalled();
    expect(result.attributes).toHaveLength(5);
    expect(result.attributes.every((a) => a.value === null)).toBe(true);
  });

  it('fetches relative upload URLs against PUBLIC_BASE_URL and sends them as inline image data', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        category: { value: 'Sneaker', confidence: 0.9 },
        color: { value: 'Schwarz', confidence: 0.8 },
        brand: { value: null, confidence: 0.1 },
        material: { value: 'Leder', confidence: 0.6 },
        condition: { value: 'good', confidence: 0.7 },
      }),
    });

    const provider = new RealGeminiVisionProvider(
      makeConfig({ GEMINI_API_KEY: 'real-key', PUBLIC_BASE_URL: 'https://example.test' }),
    );
    const result = await provider.analyzeItem({ imageUrls: ['/uploads/abc.jpg'] });

    expect(global.fetch).toHaveBeenCalledWith('https://example.test/uploads/abc.jpg');
    const call = generateContentMock.mock.calls[0][0];
    expect(call.contents[0].parts[1].inlineData.mimeType).toBe('image/jpeg');
    expect(typeof call.contents[0].parts[1].inlineData.data).toBe('string');

    const category = result.attributes.find((a) => a.key === 'category');
    const brand = result.attributes.find((a) => a.key === 'brand');
    expect(category?.value).toBe('Sneaker');
    expect(brand?.value).toBeNull();
  });

  it('never fabricates a value when Gemini returns unparsable output — everything becomes UNKNOWN', async () => {
    generateContentMock.mockResolvedValue({ text: 'not valid json{{{' });

    const provider = new RealGeminiVisionProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.analyzeItem({ imageUrls: ['/uploads/abc.jpg'] });

    expect(result.attributes.every((a) => a.value === null)).toBe(true);
  });

  it('treats a whitespace-only value the same as no value (UNKNOWN, not INFERRED)', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        category: { value: '   ', confidence: 0.5 },
        color: { value: null, confidence: 0 },
        brand: { value: null, confidence: 0 },
        material: { value: null, confidence: 0 },
        condition: { value: null, confidence: 0 },
      }),
    });

    const provider = new RealGeminiVisionProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.analyzeItem({ imageUrls: ['/uploads/abc.jpg'] });

    expect(result.attributes.find((a) => a.key === 'category')?.value).toBeNull();
  });
});
