import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PriceRecommendationService } from '../pricing/price-recommendation.service';
import { FollowUpService } from './follow-up.service';
import {
  CanonicalListingEntity,
  ItemEntity,
  ItemPriceResearchEntity,
  ListingPriceChangeEntity,
} from '../../infrastructure/database/entities';

const now = new Date('2026-10-06T10:00:00.000Z');
const day = 24 * 60 * 60 * 1000;
const description = 'Blaue Jacke, Größe M.';

function researchRow(
  fetchedAt = new Date('2026-10-01T00:00:00.000Z'),
): ItemPriceResearchEntity {
  return {
    id: 'research-1',
    itemId: 'item-1',
    source: 'EBAY_ACTIVE_LISTINGS',
    median: 36.78,
    p25: 30,
    p75: 42,
    sampleSize: 8,
    currency: 'EUR',
    providerLabel: 'eBay',
    rawResponse: null,
    fetchedAt,
  } as ItemPriceResearchEntity;
}

function onlineRow(onlineSince: Date, sellingPrice = '40.00') {
  return {
    listing_id: 'listing-1',
    item_id: 'item-1',
    title: 'Jacke',
    selling_price: sellingPrice,
    description_text: description,
    marketplace_id: 'KLEINANZEIGEN',
    online_since: onlineSince,
  };
}

describe('FollowUpService', () => {
  function setup(options: {
    onlineSince: Date;
    sellingPrice?: number;
    changes?: ListingPriceChangeEntity[];
  }) {
    const changes = [...(options.changes ?? [])];
    const listing = {
      id: 'listing-1',
      itemId: 'item-1',
      userId: 'user-1',
      sellingPrice: options.sellingPrice ?? 40,
      descriptionText: description,
    };
    const manager = {
      findOne: jest.fn(async (entity: unknown) => {
        if (entity === ItemEntity)
          return { id: 'item-1', userId: 'user-1', title: 'Jacke' };
        if (entity === CanonicalListingEntity) return listing;
        return null;
      }),
      findOneBy: jest.fn(async (entity: unknown) => {
        if (entity === ItemEntity)
          return { id: 'item-1', userId: 'user-1', title: 'Jacke' };
        if (entity === CanonicalListingEntity) return listing;
        return null;
      }),
      findOneByOrFail: jest.fn(async () => listing),
      find: jest.fn(async (entity: unknown) => {
        if (entity === ListingPriceChangeEntity) return changes;
        if (entity === ItemPriceResearchEntity) return [researchRow()];
        if (entity === CanonicalListingEntity) return [{ id: listing.id }];
        return [];
      }),
      update: jest.fn(
        async (
          _entity: unknown,
          _id: unknown,
          patch: { sellingPrice: number },
        ) => {
          listing.sellingPrice = patch.sellingPrice;
        },
      ),
      save: jest.fn(
        async (_entity: unknown, value: Partial<ListingPriceChangeEntity>) => {
          const saved = {
            id: 'change-1',
            createdAt: now,
            ...value,
          } as ListingPriceChangeEntity;
          changes.push(saved);
          return saved;
        },
      ),
      createQueryBuilder: () => ({
        innerJoin: function join() {
          return this;
        },
        select: function select() {
          return this;
        },
        addSelect: function addSelect() {
          return this;
        },
        where: function where() {
          return this;
        },
        andWhere: function andWhere() {
          return this;
        },
        getRawMany: async () => [
          onlineRow(options.onlineSince, listing.sellingPrice.toFixed(2)),
        ],
      }),
    };

    const dataSource = {
      manager,
      transaction: (fn: (m: EntityManager) => Promise<unknown>) =>
        fn(manager as unknown as EntityManager),
    } as unknown as DataSource;

    return {
      service: new FollowUpService(
        dataSource,
        new PriceRecommendationService(),
      ),
      manager,
      listing,
      changes,
    };
  }

  it('lists a 7-day follow-up at P_target and keeps the copy text off the listing', async () => {
    const { service, manager } = setup({
      onlineSince: new Date(now.getTime() - 8 * day),
    });

    const cards = await service.listForUser('user-1', now);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      stage: 7,
      currentPrice: 40,
      suggestedPrice: 32,
      suggestionBasis: 'P_TARGET',
      targetPrice: 32,
      copyText: `${description}\n\nPreis: 32.00 €.`,
    });
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('skips listings that have been online for less than 7 days', async () => {
    const { service } = setup({
      onlineSince: new Date(now.getTime() - 3 * day),
    });
    await expect(service.listForUser('user-1', now)).resolves.toEqual([]);
  });

  it('suggests one step below P_target after 14 days, even if the 7-day drop was recorded', async () => {
    const { service } = setup({
      onlineSince: new Date(now.getTime() - 16 * day),
      sellingPrice: 32,
      changes: [
        {
          id: 'earlier',
          canonicalListingId: 'listing-1',
          previousPrice: 40,
          newPrice: 32,
          note: 'Preis am 29.9.2026 gesenkt',
          followUpDays: 7,
          createdAt: new Date(now.getTime() - 8 * day),
        } as ListingPriceChangeEntity,
      ],
    });

    const cards = await service.listForUser('user-1', now);
    expect(cards[0]).toMatchObject({
      stage: 14,
      currentPrice: 32,
      suggestedPrice: 27,
      suggestionBasis: 'ONE_STEP_BELOW',
      suggestionAnchor: 'P_TARGET',
    });
  });

  it('records the new price, the previous price and the note without rewriting the description', async () => {
    const { service, manager, listing } = setup({
      onlineSince: new Date(now.getTime() - 16 * day),
    });

    const result = await service.recordPriceDrop({
      userId: 'user-1',
      itemId: 'item-1',
      newPrice: 27,
      canonicalListingId: 'listing-1',
      now,
    });

    expect(manager.update).toHaveBeenCalledTimes(1);
    expect(manager.update).toHaveBeenCalledWith(
      CanonicalListingEntity,
      { id: 'listing-1' },
      { sellingPrice: 27 },
    );
    expect(listing.descriptionText).toBe(description);
    expect(result).toMatchObject({
      previousPrice: 40,
      sellingPrice: 27,
      note: 'Preis am 6.10.2026 gesenkt',
      descriptionText: description,
      followUp: null,
    });
    expect(result.priceChanges[0]).toMatchObject({
      previousPrice: 40,
      newPrice: 27,
      note: 'Preis am 6.10.2026 gesenkt',
      followUpDays: 14,
    });
    expect(result.descriptionText).not.toContain('Preis: 27.00 €.');
  });

  it('refuses a price that is not lower and does not write', async () => {
    const { service, manager, listing } = setup({
      onlineSince: new Date(now.getTime() - 8 * day),
    });

    await expect(
      service.recordPriceDrop({
        userId: 'user-1',
        itemId: 'item-1',
        newPrice: 40,
        now,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.update).not.toHaveBeenCalled();
    expect(listing.descriptionText).toBe(description);
    expect(listing.sellingPrice).toBe(40);
  });
});
