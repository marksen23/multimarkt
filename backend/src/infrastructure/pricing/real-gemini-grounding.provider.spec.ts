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

  it('builds a span from the listed prices when the model withholds the median', async () => {
    interactionsCreateMock.mockResolvedValue({
      output_text:
        'Zu wenig für einen Median.\n{"median":null,"p25":null,"p75":null,"sampleSize":2,"comparableListings":[{"title":"A","price":20,"url":"https://www.ebay.de/itm/1"},{"title":"B","price":40,"url":"not-a-url"}]}',
    });

    const provider = new RealGeminiGroundingProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.search({ keywords: 'Nike Sneaker', condition: 'good' });

    expect(result?.sampleSize).toBe(2);
    expect(result?.median).toBe(30);
    expect(result?.comparableListings[0].url).toBe('https://www.ebay.de/itm/1');
    expect(result?.comparableListings[1].url).toBeNull();
  });

  it('returns null (not a fabricated number) when the model reports too few sources', async () => {
    interactionsCreateMock.mockResolvedValue({
      output_text: JSON.stringify({ median: null, p25: null, p75: null, sampleSize: 2, comparableListings: [] }),
    });

    const provider = new RealGeminiGroundingProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.search({ keywords: 'Nike Sneaker', condition: 'good' });

    expect(result).toBeNull();
  });

  it('drops accessories, defects and bundles from a recorded grounded answer', async () => {
    interactionsCreateMock.mockResolvedValue({
      output_text: JSON.stringify({
        median: 70,
        p25: 25,
        p75: 180,
        sampleSize: 6,
        comparableListings: [
          { title: 'Bosch GBH 2-28 F gebraucht', price: 80, url: 'https://www.ebay.de/itm/1' },
          { title: 'Bosch GBH 2-28 F', price: 100, url: 'https://www.ebay.de/itm/2' },
          { title: 'Koffer für Bosch GBH 2-28', price: 25, url: 'https://www.ebay.de/itm/3' },
          { title: 'Bosch GBH 2-28 defekt', price: 30, url: null },
          { title: 'Konvolut 3 Stück Bosch', price: 150, url: null },
          { title: 'Bosch GBH 2-28 F neu OVP', price: 180, url: null },
        ],
      }),
    });

    const provider = new RealGeminiGroundingProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.search({
      keywords: 'Bosch GBH 2-28 F',
      condition: 'Gut',
      brand: 'Bosch',
      model: 'GBH 2-28 F',
      requireModel: true,
      requireBrand: true,
    });

    expect(result?.comparableListings.map((listing) => listing.price)).toEqual([80, 100]);
    expect(result?.median).toBe(90);
    expect(result?.sampleSize).toBe(2);
    expect(result?.priceKind).toBe('ASKING');
    expect(result?.filterNote).toMatch(/Zubehör/);
  });

  it('returns null instead of throwing when the response is not valid JSON', async () => {
    interactionsCreateMock.mockResolvedValue({ output_text: 'Sicher, hier ist eine Zusammenfassung: ...' });

    const provider = new RealGeminiGroundingProvider(makeConfig({ GEMINI_API_KEY: 'real-key' }));
    const result = await provider.search({ keywords: 'Nike Sneaker', condition: 'good' });

    expect(result).toBeNull();
  });
});
