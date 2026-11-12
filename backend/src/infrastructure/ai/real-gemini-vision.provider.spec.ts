import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';

const generateContentMock = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

// Import erst NACH dem jest.mock oben, damit die gemockte Klasse greift.
import { RealGeminiVisionProvider } from './real-gemini-vision.provider';

const BOSCH_DRILL_RESPONSE = {
  category: { value: 'Elektronik', confidence: 0.91 },
  categoryDetail: { value: 'Schlagbohrmaschine', confidence: 0.93 },
  brand: { value: 'Bosch', confidence: 0.97 },
  model: { value: 'GBH 2-28 F', confidence: 0.94 },
  condition: { value: 'Gut', confidence: 0.7 },
  title: { value: 'Bosch GBH 2-28 F Schlagbohrmaschine', confidence: 0.9 },
  description: {
    value: 'Bosch Schlagbohrmaschine GBH 2-28 F, gebraucht, im Koffer. Funktion auf den Fotos nicht geprüft.',
    confidence: 0.8,
  },
  searchTerms: { value: 'Bosch GBH 2-28 F', confidence: 0.9 },
  specs: [{ name: 'Leistung', value: '880 W', confidence: 0.86 }],
};

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
    expect(result.attributes.map((a) => a.key)).toEqual([
      'category',
      'categoryDetail',
      'color',
      'brand',
      'model',
      'material',
      'condition',
      'size',
      'measurements',
      'functionChecked',
      'notable_features',
      'visible_defects',
    ]);
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
    expect(call.contents[0].parts[1].text).toBe('Foto 1 von 1');
    expect(call.contents[0].parts[2].inlineData.mimeType).toBe('image/jpeg');
    expect(typeof call.contents[0].parts[2].inlineData.data).toBe('string');
    expect(call.config.responseMimeType).toBe('application/json');
    expect(call.config.responseSchema.properties.title).toBeDefined();
    expect(call.config.responseSchema.properties.model).toBeDefined();
    expect(call.config.responseSchema.properties.specs.type).toBe('array');
    expect(call.config.temperature).toBe(0.1);
    expect(call.config.thinkingConfig).toEqual({ thinkingBudget: 0 });

    const category = result.attributes.find((a) => a.key === 'category');
    const brand = result.attributes.find((a) => a.key === 'brand');
    expect(category?.value).toBe('Sneaker');
    expect(brand?.value).toBeNull();
  });

  it('refuses an unparsable Gemini answer instead of inventing fields', async () => {
    generateContentMock.mockResolvedValue({ text: 'not valid json{{{' });

    const provider = new RealGeminiVisionProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));

    await expect(provider.analyzeItem({ imageUrls: ['/uploads/abc.jpg'] })).rejects.toThrow(
      /nicht im erwarteten Format/,
    );
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

  it('reads a local /uploads file from disk instead of fetching PUBLIC_BASE_URL', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vision-uploads-'));
    await writeFile(join(dir, 'photo.jpg'), Buffer.from([1, 2, 3]));
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        category: { value: 'Schuhe', confidence: 0.8 },
        categoryDetail: { value: 'Sneaker', confidence: 0.7 },
      }),
    });

    const provider = new RealGeminiVisionProvider(
      makeConfig({
        GEMINI_API_KEY: 'real-key',
        PUBLIC_BASE_URL: 'http://mm.localhost',
        UPLOAD_DIR: dir,
      }),
    );
    const result = await provider.analyzeItem({ imageUrls: ['/uploads/photo.jpg'] });

    expect(global.fetch).not.toHaveBeenCalled();
    const call = generateContentMock.mock.calls[0][0];
    expect(call.contents[0].parts[2].inlineData.data).toBe(Buffer.from([1, 2, 3]).toString('base64'));
    expect(result.attributes.find((attribute) => attribute.key === 'categoryDetail')?.value).toBe('Sneaker');
  });

  it('maps a recorded drill response, including text that only arrived in a part', async () => {
    generateContentMock.mockResolvedValue({
      text: '',
      candidates: [{ content: { parts: [{ thought: true, text: 'ignore' }, { text: JSON.stringify(BOSCH_DRILL_RESPONSE) }] } }],
    });

    const provider = new RealGeminiVisionProvider(
      makeConfig({ GEMINI_API_KEY: 'real-key', GEMINI_VISION_MODEL: 'gemini-2.5-flash' }),
    );
    const result = await provider.analyzeItem({
      imageUrls: ['/uploads/overview.jpg', '/uploads/label.jpg'],
      hint: 'es ist eine\u0000 Bosch Bohrmaschine',
    });

    const call = generateContentMock.mock.calls[0][0];
    expect(call.model).toBe('gemini-2.5-flash');
    expect(call.contents[0].parts[0].text).toContain('Bosch Bohrmaschine');
    expect(call.contents[0].parts[0].text).not.toContain('\u0000');
    expect(call.contents[0].parts[0].text).toContain('Typenschild');
    expect(call.contents[0].parts.filter((part: { inlineData?: unknown }) => part.inlineData)).toHaveLength(2);

    expect(result.modelId).toBe('gemini-2.5-flash');
    expect(result.attributes.find((attribute) => attribute.key === 'model')?.value).toBe('GBH 2-28 F');
    expect(result.attributes.find((attribute) => attribute.key === 'condition')?.value).toBe('good');
    expect(result.attributes.find((attribute) => attribute.key === 'title')?.value).toMatch(/Schlagbohrmaschine/);
    expect(result.attributes.find((attribute) => attribute.key === 'spec:Leistung')?.value).toBe('880 W');
  });

  it('sends the first photos and the last two when more than eight are attached', async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ category: { value: 'Elektronik', confidence: 0.5 } }) });
    const provider = new RealGeminiVisionProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const urls = Array.from({ length: 10 }, (_, index) => `/uploads/p${index}.jpg`);

    await provider.analyzeItem({ imageUrls: urls });

    const parts = generateContentMock.mock.calls[0][0].contents[0].parts as Array<{ text?: string }>;
    const labels = parts.map((part) => part.text).filter((text) => text?.startsWith('Foto'));
    expect(labels).toEqual([
      'Foto 1 von 8',
      'Foto 2 von 8',
      'Foto 3 von 8',
      'Foto 4 von 8',
      'Foto 5 von 8',
      'Foto 6 von 8',
      'Foto 7 von 8',
      'Foto 8 von 8',
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(8);
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/uploads/p0.jpg');
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/uploads/p9.jpg');
    expect(global.fetch).not.toHaveBeenCalledWith('http://localhost:3000/uploads/p6.jpg');
  });

  it('turns an invalid key into a German message and does not repeat the key', async () => {
    generateContentMock.mockRejectedValue(new Error('API key not valid: super-secret-key'));
    const provider = new RealGeminiVisionProvider(makeConfig({ GEMINI_API_KEY: 'super-secret-key' }));

    await expect(provider.analyzeItem({ imageUrls: ['/uploads/abc.jpg'] })).rejects.toThrow(/gültigen GEMINI_API_KEY/);
    await expect(provider.analyzeItem({ imageUrls: ['/uploads/abc.jpg'] })).rejects.not.toThrow(/super-secret-key/);
  });
});
