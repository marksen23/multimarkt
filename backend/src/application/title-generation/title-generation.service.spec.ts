import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TitleGenerationService } from './title-generation.service';
import { TitleTokenAnalysisService } from './title-token-analysis.service';
import { TitleGenerationProvider } from '../../domain/ai/title-generation-provider.interface';
import { PriceTriangulationService } from '../pricing/price-triangulation.service';

describe('TitleGenerationService', () => {
  const item = { id: 'item-1', title: 'Herrenjacke', condition: 'good' };

  function makeDataSource(foundItem: unknown = item, attributes: unknown[] = []): DataSource {
    return {
      manager: {
        findOneBy: jest.fn().mockResolvedValue(foundItem),
        find: jest.fn().mockResolvedValue(attributes),
      },
    } as unknown as DataSource;
  }

  function makeProvider(result: string | null): TitleGenerationProvider {
    return { generate: jest.fn().mockResolvedValue(result) };
  }

  function makePriceTriangulation(comparableListings: { title: string; price: number }[]): PriceTriangulationService {
    return {
      research: jest.fn().mockResolvedValue({
        itemId: 'item-1',
        sources: [{ detail: { comparableListings } }],
        fetchedAt: new Date().toISOString(),
      }),
    } as unknown as PriceTriangulationService;
  }

  it('throws NotFoundException when the item does not exist', async () => {
    const service = new TitleGenerationService(
      makeDataSource(null),
      makeProvider('Titel'),
      makePriceTriangulation([]),
      new TitleTokenAnalysisService(),
    );

    await expect(service.generateTitle('missing', 'KLEINANZEIGEN')).rejects.toThrow(NotFoundException);
  });

  it('returns the provider suggestion together with the gap analysis', async () => {
    const service = new TitleGenerationService(
      makeDataSource(),
      makeProvider('Herrenjacke Leder OVP'),
      makePriceTriangulation([
        { title: 'Herrenjacke Leder OVP', price: 40 },
        { title: 'Jacke Leder OVP', price: 45 },
      ]),
      new TitleTokenAnalysisService(),
    );

    const result = await service.generateTitle('item-1', 'KLEINANZEIGEN');

    expect(result.title).toBe('Herrenjacke Leder OVP');
    expect(result.gapAnalysis.missingTokens).toContain('leder');
  });

  it('falls back to the existing item title when the provider returns null', async () => {
    const service = new TitleGenerationService(
      makeDataSource(),
      makeProvider(null),
      makePriceTriangulation([]),
      new TitleTokenAnalysisService(),
    );

    const result = await service.generateTitle('item-1', 'KLEINANZEIGEN');

    expect(result.title).toBe('Herrenjacke');
  });

  it('still returns a suggestion when price research fails', async () => {
    const failingTriangulation = {
      research: jest.fn().mockRejectedValue(new Error('boom')),
    } as unknown as PriceTriangulationService;

    const service = new TitleGenerationService(
      makeDataSource(),
      makeProvider('Titel'),
      failingTriangulation,
      new TitleTokenAnalysisService(),
    );

    const result = await service.generateTitle('item-1', 'KLEINANZEIGEN');

    expect(result.title).toBe('Titel');
    expect(result.gapAnalysis.missingTokens).toEqual([]);
  });
});
