import { BadRequestException } from '@nestjs/common';
import { PriceRecommendationService } from '../pricing/price-recommendation.service';
import {
  CanonicalListingEntity,
  ItemEntity,
  ItemMarkdownPlanEntity,
  MarkdownTaskEntity,
  MarketplaceProjectionEntity,
  UserEntity,
} from '../../infrastructure/database/entities';
import { TypeOrmMarkdownStore } from './markdown.store';

const now = new Date('2026-10-09T10:00:00.000Z');

function fixture(status: 'LISTED' | 'SOLD', targetPrice = 36) {
  const task = {
    id: 'task-1',
    userId: 'user-1',
    itemId: 'item-1',
    kind: 'MANUAL_PRICE' as const,
    status: 'OPEN' as const,
    targetPrice,
    previousPrice: 40,
    projectionId: 'proj-1',
    marketplaceId: 'KLEINANZEIGEN',
    message: 'Preis auf 36,00 € senken',
  };
  const item = { id: 'item-1', userId: 'user-1', status, title: 'Jacke', condition: null };
  const user = {
    id: 'user-1',
    markdownEnabled: true,
    markdownPercent: 10,
    markdownIntervalDays: 7,
    attentionAfterDays: 21,
  };
  const plan = {
    itemId: 'item-1',
    userId: 'user-1',
    status: 'INHERIT' as const,
    percent: null,
    intervalDays: null,
    floorPrice: 30,
    lastAppliedAt: null,
    lastAttemptAt: null,
    lastError: null,
  };
  const listing = {
    id: 'listing-1',
    itemId: 'item-1',
    sellingPrice: 40,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
  };
  const projection = {
    id: 'proj-1',
    canonicalListingId: 'listing-1',
    marketplaceId: 'KLEINANZEIGEN',
    status: 'ONLINE',
    externalPlatformId: null,
    publishMeta: {},
    onlineSince: new Date('2026-10-01T00:00:00.000Z'),
    suggestedPrice: 40,
  };
  const updates: string[] = [];
  const saves: { source?: string; status?: string; newPrice?: number }[] = [];
  const manager = {
    findOne: jest.fn(async (entity: unknown) => {
      if (entity === MarkdownTaskEntity) return task;
      if (entity === ItemEntity) return item;
      if (entity === CanonicalListingEntity) return listing;
      return null;
    }),
    findOneBy: jest.fn(async (entity: unknown) => {
      if (entity === UserEntity) return user;
      if (entity === ItemMarkdownPlanEntity) return plan;
      return null;
    }),
    find: jest.fn(async (entity: unknown) => {
      if (entity === CanonicalListingEntity) return [listing];
      if (entity === MarketplaceProjectionEntity) return [projection];
      return [];
    }),
    count: jest.fn(async () => 2),
    update: jest.fn(async (entity: { name: string }, _where: unknown, patch: { sellingPrice?: number }) => {
      updates.push(entity.name);
      if (patch.sellingPrice != null) listing.sellingPrice = patch.sellingPrice;
    }),
    create: jest.fn((_entity: unknown, row: unknown) => row),
    save: jest.fn(async (row: { source?: string; status?: string; newPrice?: number }) => {
      saves.push(row);
      return row;
    }),
  };
  const store = new TypeOrmMarkdownStore(
    manager as never,
    { recommend: jest.fn() } as unknown as PriceRecommendationService,
  );
  return { store, updates, saves, task, listing };
}

describe('TypeOrmMarkdownStore.confirm', () => {
  it('does not change the price of a sold item', async () => {
    const { store, updates, saves, task } = fixture('SOLD');
    const result = await store.confirm('user-1', 'task-1', now);
    expect(result.applied).toBe(false);
    expect(result.message).toMatch(/verkauft/);
    expect(updates).not.toContain('CanonicalListingEntity');
    expect(saves.some((row) => row.source === 'MANUAL_CONFIRM')).toBe(false);
    expect(task.status).toBe('DISMISSED');
  });

  it('writes the confirmed price and refuses a price under the floor', async () => {
    const ok = fixture('LISTED', 36);
    const result = await ok.store.confirm('user-1', 'task-1', now);
    expect(result).toMatchObject({ applied: true, message: 'Preis auf 36,00 € gesenkt.' });
    expect(ok.updates).toContain('CanonicalListingEntity');
    expect(ok.listing.sellingPrice).toBe(36);
    expect(ok.saves).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'MANUAL_CONFIRM', newPrice: 36 })]));

    const low = fixture('LISTED', 10);
    await expect(low.store.confirm('user-1', 'task-1', now)).rejects.toBeInstanceOf(BadRequestException);
    expect(low.updates).not.toContain('CanonicalListingEntity');
    expect(low.listing.sellingPrice).toBe(40);
  });
});
