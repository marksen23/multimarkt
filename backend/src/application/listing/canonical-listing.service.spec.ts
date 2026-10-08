import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CanonicalListingService } from './canonical-listing.service';
import { DescriptionGenerationProvider } from '../../domain/ai/description-generation-provider.interface';
import { PriceTriangulationService } from '../pricing/price-triangulation.service';
import { StateGuardService } from '../state-guard/state-guard.service';
import { TitleTokenAnalysisService } from '../title-generation/title-token-analysis.service';
import { VaguePhraseDetectorService } from './vague-phrase-detector.service';

const item = { id: 'item-1', title: 'Herrenjacke', condition: 'good' };

function makeDataSource(foundItem: unknown = item, attributes: unknown[] = []): DataSource {
  return {
    manager: {
      findOneBy: jest.fn().mockResolvedValue(foundItem),
      find: jest.fn().mockResolvedValue(attributes),
    },
  } as unknown as DataSource;
}

function makeProvider(result: string | null): DescriptionGenerationProvider {
  return { generate: jest.fn().mockResolvedValue(result) };
}

function makePriceTriangulation(
  comparableListings: { title: string; price: number }[] = [],
): PriceTriangulationService {
  return {
    research: jest.fn().mockResolvedValue({
      itemId: 'item-1',
      sources: [{ detail: { comparableListings } }],
      fetchedAt: new Date().toISOString(),
      recommendation: null,
    }),
  } as unknown as PriceTriangulationService;
}

function makeService(
  dataSource: DataSource,
  provider: DescriptionGenerationProvider,
  priceTriangulation = makePriceTriangulation(),
) {
  return new CanonicalListingService(
    dataSource,
    {} as StateGuardService,
    provider,
    priceTriangulation,
    new TitleTokenAnalysisService(),
    new VaguePhraseDetectorService(),
  );
}

describe('CanonicalListingService.generateDescription', () => {
  it('throws NotFoundException when the item does not exist', async () => {
    const service = makeService(makeDataSource(null), makeProvider('Text'));

    await expect(service.generateDescription('missing')).rejects.toThrow(NotFoundException);
  });

  it('returns the description together with a gap analysis computed against the description text (not the title)', async () => {
    const service = makeService(
      makeDataSource(),
      makeProvider('Herrenjacke aus Leder, kaum getragen.'),
      makePriceTriangulation([
        { title: 'Herrenjacke Leder OVP', price: 40 },
        { title: 'Jacke Leder OVP', price: 45 },
      ]),
    );

    const result = await service.generateDescription('item-1');

    expect(result.descriptionText).toBe('Herrenjacke aus Leder, kaum getragen.');
    // "ovp" kommt in beiden Vergleichstiteln vor, aber nicht im generierten Text.
    expect(result.gapAnalysis.missingTokens).toContain('ovp');
  });

  it('flags vague phrases in the generated description', async () => {
    const service = makeService(makeDataSource(), makeProvider('Jacke in gutem Zustand, wie neu.'));

    const result = await service.generateDescription('item-1');

    const phrases = result.vaguePhrases.map((p) => p.phrase);
    expect(phrases).toContain('guter Zustand');
    expect(phrases).toContain('wie neu');
  });

  it('reports no vague phrases for a concrete description', async () => {
    const service = makeService(
      makeDataSource(),
      makeProvider('Kratzer an der Unterseite (Foto 3), einmal getragen.'),
    );

    const result = await service.generateDescription('item-1');

    expect(result.vaguePhrases).toEqual([]);
  });

  it('falls back to the plain template (and still returns a valid analysis) when the provider yields nothing', async () => {
    const service = makeService(makeDataSource(), makeProvider(null));

    const result = await service.generateDescription('item-1');

    expect(result.descriptionText).toBe('Herrenjacke — Zustand: good');
    expect(result.gapAnalysis).toBeDefined();
    expect(result.vaguePhrases).toEqual([]);
  });

  it('writes shipping text for a small parcel and drops pickup-only wording', async () => {
    const service = makeService(
      makeDataSource({
        ...item,
        logisticsCaptured: true,
        weightGrams: 180,
        lengthCm: 22,
        widthCm: 16,
        heightCm: 2,
        logisticsBulky: false,
        pickupOnly: false,
        shippingPossible: true,
        postalCode: '10115',
      }),
      makeProvider('Sofort abholbar am Bahnhof. Kaum benutzt.'),
    );

    const result = await service.generateDescription('item-1');

    expect(result.descriptionText).toMatch(/Versand möglich/);
    expect(result.descriptionText).not.toMatch(/abholung|abholbar|selbstabhol/i);
    expect(result.descriptionText).toContain('180 g');
  });

  it('writes pickup text for a sofa and drops a shipping offer', async () => {
    const service = makeService(
      makeDataSource({
        ...item,
        title: 'Sofa',
        condition: 'Gebraucht',
        logisticsCaptured: true,
        weightGrams: 45_000,
        lengthCm: 210,
        widthCm: 95,
        heightCm: 85,
        logisticsBulky: true,
        pickupOnly: true,
        shippingPossible: false,
        postalCode: '10115',
      }),
      makeProvider('Versand möglich, gerne verschickt.'),
    );

    const result = await service.generateDescription('item-1');

    expect(result.descriptionText).toMatch(/Nur Abholung in 10115/);
    expect(result.descriptionText).not.toMatch(/Versand möglich/);
    expect(result.descriptionText).toContain('45 kg');
  });
});
