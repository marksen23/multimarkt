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

  it('keeps channel descriptions different even when the provider returns the same paragraph', async () => {
    const provider = makeProvider('Gleicher Absatz ohne Portalbezug.');
    const facts = makeDataSource(item, [
      { attributeKey: 'brand', attributeValue: 'Nike' },
      { attributeKey: 'color', attributeValue: 'Schwarz' },
      { attributeKey: 'size', attributeValue: '42' },
    ]);

    const klein = await makeService(facts, provider).generateDescription('item-1', null, 'KLEINANZEIGEN');
    const vinted = await makeService(facts, provider).generateDescription('item-1', null, 'VINTED');

    expect(klein.descriptionText).toMatch(/abhol/i);
    expect(klein.descriptionText).toContain('PLZ');
    expect(vinted.descriptionText).toContain('Maße');
    expect(klein.descriptionText).not.toBe(vinted.descriptionText);
  });

  it('falls back to the plain template (and still returns a valid analysis) when the provider yields nothing', async () => {
    const service = makeService(makeDataSource(), makeProvider(null));

    const result = await service.generateDescription('item-1');

    expect(result.descriptionText).toBe('Herrenjacke — Zustand: good');
    expect(result.gapAnalysis).toBeDefined();
    expect(result.vaguePhrases).toEqual([]);
  });
});
