import { ConfigService } from '@nestjs/config';

const generateContentMock = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

import { RealImageOptimizationProvider } from './real-image-optimization.provider';

function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('RealImageOptimizationProvider', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
  });

  it('extracts the generated image from the response and base64-decodes it', async () => {
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              { text: 'Hier ist das optimierte Bild.' },
              { inlineData: { mimeType: 'image/png', data: Buffer.from('fake-image').toString('base64') } },
            ],
          },
        },
      ],
    });

    const provider = new RealImageOptimizationProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.optimize({ buffer: Buffer.from('original'), mimeType: 'image/jpeg' });

    expect(result?.mimeType).toBe('image/png');
    expect(result?.buffer.toString()).toBe('fake-image');
  });

  it('sends the original image as inline base64 data alongside the edit instruction', async () => {
    generateContentMock.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'AA==' } }] } }],
    });

    const provider = new RealImageOptimizationProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    await provider.optimize({ buffer: Buffer.from('original'), mimeType: 'image/jpeg' });

    const call = generateContentMock.mock.calls[0][0];
    const parts = call.contents[0].parts;
    expect(parts.some((p: { text?: string }) => typeof p.text === 'string')).toBe(true);
    expect(parts.find((p: { inlineData?: unknown }) => p.inlineData).inlineData.data).toBe(
      Buffer.from('original').toString('base64'),
    );
  });

  it('returns null instead of a fake image when Gemini returns no image part', async () => {
    generateContentMock.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'Ich kann dieses Bild nicht bearbeiten.' }] } }],
    });

    const provider = new RealImageOptimizationProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.optimize({ buffer: Buffer.from('original'), mimeType: 'image/jpeg' });

    expect(result).toBeNull();
  });

  it('returns null when the response has no candidates at all', async () => {
    generateContentMock.mockResolvedValue({});

    const provider = new RealImageOptimizationProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.optimize({ buffer: Buffer.from('original'), mimeType: 'image/jpeg' });

    expect(result).toBeNull();
  });
});
