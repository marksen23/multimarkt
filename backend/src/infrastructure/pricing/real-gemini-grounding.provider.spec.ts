import { ConfigService } from '@nestjs/config';

const interactionsCreateMock = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    interactions: { create: interactionsCreateMock },
  })),
}));

import { RealGeminiGroundingProvider } from './real-gemini-grounding.provider';

function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('RealGeminiGroundingProvider', () => {
  beforeEach(() => {
    interactionsCreateMock.mockReset();
  });

  it('returns null without calling Gemini for empty keywords', async () => {
    const provider = new RealGeminiGroundingProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.search({ keywords: '  ', condition: 'good' });

    expect(result).toBeNull();
    expect(interactionsCreateMock).not.toHaveBeenCalled();
  });

  it('enables the google_search tool and parses a valid grounded JSON answer', async () => {
    interactionsCreateMock.mockResolvedValue({
      output_text: JSON.stringify({
        median: 36,
        p25: 30,
        p75: 44,
        sampleSize: 7,
        comparableListings: [{ title: 'Nike Sneaker, gebraucht', price: 35 }],
      }),
    });

    const provider = new RealGeminiGroundingProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.search({ keywords: 'Nike Sneaker', condition: 'good' });

    const call = interactionsCreateMock.mock.calls[0][0];
    expect(call.tools).toEqual([{ type: 'google_search' }]);
    expect(result?.median).toBe(36);
    expect(result?.comparableListings).toHaveLength(1);
  });

  it('strips a markdown code fence before parsing', async () => {
    interactionsCreateMock.mockResolvedValue({
      output_text: '```json\n{"median":40,"p25":35,"p75":45,"sampleSize":6,"comparableListings":[]}\n```',
    });

    const provider = new RealGeminiGroundingProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.search({ keywords: 'Nike Sneaker', condition: null });

    expect(result?.median).toBe(40);
  });

  it('returns null (not a fabricated number) when the model reports too few sources', async () => {
    interactionsCreateMock.mockResolvedValue({
      output_text: JSON.stringify({ median: null, p25: null, p75: null, sampleSize: 2, comparableListings: [] }),
    });

    const provider = new RealGeminiGroundingProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.search({ keywords: 'Nike Sneaker', condition: 'good' });

    expect(result).toBeNull();
  });

  it('returns null instead of throwing when the response is not valid JSON', async () => {
    interactionsCreateMock.mockResolvedValue({ output_text: 'Sicher, hier ist eine Zusammenfassung: ...' });

    const provider = new RealGeminiGroundingProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.search({ keywords: 'Nike Sneaker', condition: 'good' });

    expect(result).toBeNull();
  });
});
