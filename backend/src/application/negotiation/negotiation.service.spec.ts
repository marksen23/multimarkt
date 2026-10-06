import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ItemEntity,
  ItemPriceResearchEntity,
} from '../../infrastructure/database/entities';
import { PriceRecommendationService } from '../pricing/price-recommendation.service';
import { NegotiationService } from './negotiation.service';

function researchRow(
  overrides: Partial<ItemPriceResearchEntity> = {},
): ItemPriceResearchEntity {
  return {
    id: 'research-new',
    itemId: 'item-1',
    source: 'EBAY_ACTIVE_LISTINGS',
    median: 100,
    p25: 80,
    p75: 120,
    sampleSize: 8,
    currency: 'EUR',
    providerLabel: 'eBay',
    rawResponse: null,
    fetchedAt: new Date('2026-10-05T00:00:00.000Z'),
    ...overrides,
  } as ItemPriceResearchEntity;
}

describe('NegotiationService', () => {
  function setup(
    rows: ItemPriceResearchEntity[] | null,
    item: ItemEntity | null = itemRow(),
  ) {
    const manager = {
      findOneBy: jest.fn(async (entity: unknown) => {
        if (entity === ItemEntity) return item;
        return null;
      }),
      find: jest.fn(async (entity: unknown) => {
        if (entity === ItemPriceResearchEntity) return rows ?? [];
        return [];
      }),
      save: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };
    const dataSource = { manager } as unknown as DataSource;
    return {
      service: new NegotiationService(
        dataSource,
        new PriceRecommendationService(),
      ),
      manager,
    };
  }

  it('compares the pasted offer with this article’s P_min and P_target and stores nothing', async () => {
    const older = researchRow({
      id: 'research-old',
      median: 10,
      fetchedAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    const { service, manager } = setup([researchRow(), older]);

    const result = await service.suggest({
      userId: 'user-1',
      itemId: 'item-1',
      message: '  ich biete 70€ und hole ab  ',
      platform: 'EBAY',
    });

    expect(result.itemId).toBe('item-1');
    expect(result.title).toBe('Jacke');
    expect(result.platform).toBe('EBAY');
    expect(result.offer).toBe(70);
    expect(result.targetPrice).toBe(87);
    expect(result.minPrice).toBe(80.04);
    expect(result.position).toBe('BELOW_MIN');
    expect(result.replies).toHaveLength(3);
    expect(result.replies.map((reply) => reply.id)).toEqual([
      'accept',
      'counter',
      'decline',
    ]);
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('rejects a missing message, a missing article, and an article without prices', async () => {
    const { service } = setup([researchRow()]);
    await expect(
      service.suggest({ userId: 'user-1', itemId: 'item-1', message: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const missing = setup([], null);
    await expect(
      missing.service.suggest({
        userId: 'user-1',
        itemId: 'item-1',
        message: '80€',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const noPrices = setup([]);
    await expect(
      noPrices.service.suggest({
        userId: 'user-1',
        itemId: 'item-1',
        message: '80€',
      }),
    ).rejects.toThrow(
      'Für diesen Artikel fehlen Zielpreis und Schmerzgrenze. Zuerst die Preisrecherche ausführen.',
    );
  });
});

function itemRow(): ItemEntity {
  return {
    id: 'item-1',
    userId: 'user-1',
    title: 'Jacke',
  } as ItemEntity;
}
