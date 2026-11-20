import { ConfigService } from '@nestjs/config';

const generateContentMock = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

import { RealGeminiPhotoTipProvider } from './real-gemini-photo-tip.provider';

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('RealGeminiPhotoTipProvider', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
  });

  it('returns the German tip from the JSON fixture and sends the photo', async () => {
    generateContentMock.mockResolvedValue({
      text: '{"tip":"Halt das Handy ruhig und tritt einen Schritt zurück."}',
    });
    const provider = new RealGeminiPhotoTipProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const tip = await provider.advise({
      buffer: Buffer.from('jpeg-bytes'),
      mimeType: 'image/jpeg',
      issues: ['BLURRY', 'CUT_OFF'],
    });

    expect(tip).toBe('Halt das Handy ruhig und tritt einen Schritt zurück.');
    const call = generateContentMock.mock.calls[0][0];
    const parts = call.contents[0].parts;
    expect(parts[0].text).toContain('unscharf');
    expect(parts[0].text).toContain('angeschnitten');
    expect(parts[1].inlineData.data).toBe(Buffer.from('jpeg-bytes').toString('base64'));
    expect(call.model).toBe('gemini-flash-latest');
  });

  it('returns null instead of a made-up tip when Gemini sends no usable text', async () => {
    generateContentMock.mockResolvedValue({ text: '{"tip":"kurz"}' });
    const provider = new RealGeminiPhotoTipProvider(
      makeConfig({ GEMINI_API_KEY: 'real-key', GEMINI_VISION_MODEL: 'gemini-2.5-flash' }),
    );
    await expect(
      provider.advise({ buffer: Buffer.from('jpeg'), mimeType: 'image/jpeg', issues: ['TOO_DARK'] }),
    ).resolves.toBeNull();
    expect(generateContentMock.mock.calls[0][0].model).toBe('gemini-2.5-flash');
  });

  it('does not call Gemini when the pixel check found nothing', async () => {
    const provider = new RealGeminiPhotoTipProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    await expect(
      provider.advise({ buffer: Buffer.from('jpeg'), mimeType: 'image/jpeg', issues: [] }),
    ).resolves.toBeNull();
    expect(generateContentMock).not.toHaveBeenCalled();
  });
});
