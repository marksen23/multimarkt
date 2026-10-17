import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  buildFollowUp,
  BuiltFollowUp,
  priceLoweredNote,
} from '../../domain/listing/follow-up';
import { roundMoney } from '../../domain/pricing/expected-margin';
import {
  CanonicalListingEntity,
  ItemEntity,
  ItemPriceResearchEntity,
  ListingPriceChangeEntity,
  MarketplaceProjectionEntity,
} from '../../infrastructure/database/entities';
import { PriceResearchSourceResult } from '../pricing/price-triangulation.service';
import { PriceRecommendationService } from '../pricing/price-recommendation.service';

export interface PriceChangeView {
  id: string;
  listingId: string;
  previousPrice: number;
  newPrice: number;
  note: string;
  followUpDays: number;
  changedAt: string;
}

export interface FollowUpCard extends BuiltFollowUp {
  itemId: string;
  title: string | null;
  listingId: string;
  marketplaceId: string;
  onlineSince: string;
  currentPrice: number;
  targetPrice: number | null;
}

export interface ItemFollowUp {
  followUp: FollowUpCard | null;
  priceChanges: PriceChangeView[];
}

export interface PriceDropResult {
  listingId: string;
  previousPrice: number;
  sellingPrice: number;
  note: string;
  descriptionText: string;
  followUp: FollowUpCard | null;
  priceChanges: PriceChangeView[];
}

interface OnlineListing {
  listingId: string;
  itemId: string;
  title: string | null;
  sellingPrice: number;
  descriptionText: string;
  marketplaceId: string;
  onlineSince: Date;
}

/**
 * Nachfassen und Preissenken (Feature-Plan 3.6).
 *
 * Liest Anzeigen, die seit 7 oder 14 Tagen online sind, und schlägt einen
 * Preis plus einen Text zum Kopieren vor. `recordPriceDrop` schreibt nur
 * den neuen Preis, den bisherigen Preis und den Vermerk. Der Anzeigentext
 * und die Marktplatz-Projektion bleiben unverändert.
 */
@Injectable()
export class FollowUpService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly priceRecommendation: PriceRecommendationService,
  ) {}

  async listForUser(userId: string, now = new Date()): Promise<FollowUpCard[]> {
    const online = await this.onlineListings(this.dataSource.manager, userId);
    const cards = await this.cardsFor(this.dataSource.manager, online, now);
    return cards.sort(compareFollowUps);
  }

  async forItem(
    userId: string,
    itemId: string,
    now = new Date(),
  ): Promise<ItemFollowUp> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, {
      id: itemId,
      userId,
    });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    const online = await this.onlineListings(
      this.dataSource.manager,
      userId,
      itemId,
    );
    const listingIds = await this.listingIdsForItem(
      this.dataSource.manager,
      itemId,
    );
    const changes = await this.priceChanges(
      this.dataSource.manager,
      listingIds,
    );
    const cards = await this.cardsFor(
      this.dataSource.manager,
      online,
      now,
      changes,
    );
    cards.sort(compareFollowUps);
    return { followUp: cards[0] ?? null, priceChanges: changes };
  }

  async recordPriceDrop(input: {
    userId: string;
    itemId: string;
    newPrice: number;
    canonicalListingId?: string;
    now?: Date;
  }): Promise<PriceDropResult> {
    const now = input.now ?? new Date();
    const rounded = roundMoney(input.newPrice);

    return this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(ItemEntity, {
        where: { id: input.itemId, userId: input.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException(`Item ${input.itemId} not found`);

      const online = await this.onlineListings(
        manager,
        input.userId,
        input.itemId,
      );
      const listingIds = online.map((listing) => listing.listingId);
      const changes = await this.priceChanges(manager, listingIds);
      const cards = await this.cardsFor(manager, online, now, changes);
      cards.sort(compareFollowUps);

      const card = input.canonicalListingId
        ? cards.find(
            (candidate) => candidate.listingId === input.canonicalListingId,
          )
        : cards[0];
      if (!card) {
        throw new BadRequestException(
          'Für diese Anzeige ist kein Nachfassen fällig.',
        );
      }

      const listing = await manager.findOne(CanonicalListingEntity, {
        where: { id: card.listingId, itemId: item.id, userId: input.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!listing)
        throw new NotFoundException(`Listing ${card.listingId} not found`);

      const descriptionText = listing.descriptionText;
      if (!(rounded > 0) || rounded >= roundMoney(listing.sellingPrice)) {
        throw new BadRequestException(
          'Der neue Preis muss unter dem bisherigen Preis liegen.',
        );
      }

      const previousPrice = roundMoney(listing.sellingPrice);
      await manager.update(
        CanonicalListingEntity,
        { id: listing.id },
        { sellingPrice: rounded },
      );

      const note = priceLoweredNote(now);
      const saved = await manager.save(ListingPriceChangeEntity, {
        canonicalListingId: listing.id,
        previousPrice,
        newPrice: rounded,
        note,
        followUpDays: card.stage,
      });

      const reloaded = await manager.findOneByOrFail(CanonicalListingEntity, {
        id: listing.id,
      });
      if (reloaded.descriptionText !== descriptionText) {
        throw new BadRequestException(
          'Der Anzeigentext darf beim Preissenken nicht geändert werden.',
        );
      }

      const nextChanges = [
        ...changes,
        toPriceChangeView(saved, saved.createdAt ?? now),
      ];
      const onlineAfter = online.map((row) =>
        row.listingId === listing.id ? { ...row, sellingPrice: rounded } : row,
      );
      const nextCards = await this.cardsFor(
        manager,
        onlineAfter,
        now,
        nextChanges,
      );
      nextCards.sort(compareFollowUps);

      return {
        listingId: listing.id,
        previousPrice,
        sellingPrice: rounded,
        note,
        descriptionText: reloaded.descriptionText,
        followUp: nextCards[0] ?? null,
        priceChanges: nextChanges.filter(
          (change) => change.listingId === listing.id,
        ),
      };
    });
  }

  private async cardsFor(
    manager: EntityManager,
    online: OnlineListing[],
    now: Date,
    knownChanges?: PriceChangeView[],
  ): Promise<FollowUpCard[]> {
    if (online.length === 0) return [];
    const changes =
      knownChanges ??
      (await this.priceChanges(
        manager,
        online.map((listing) => listing.listingId),
      ));
    const targets = await this.targetPrices(
      manager,
      online.map((listing) => listing.itemId),
    );
    const cards: FollowUpCard[] = [];
    for (const listing of online) {
      const recorded = changes
        .filter((change) => change.listingId === listing.listingId)
        .map((change) => change.followUpDays);
      const targetPrice = targets.get(listing.itemId) ?? null;
      const built = buildFollowUp({
        currentPrice: listing.sellingPrice,
        descriptionText: listing.descriptionText,
        targetPrice,
        onlineSince: listing.onlineSince,
        recordedStages: recorded,
        now,
      });
      if (!built) continue;
      cards.push({
        ...built,
        itemId: listing.itemId,
        title: listing.title,
        listingId: listing.listingId,
        marketplaceId: listing.marketplaceId,
        onlineSince: listing.onlineSince.toISOString(),
        currentPrice: roundMoney(listing.sellingPrice),
        targetPrice,
      });
    }
    return cards;
  }

  private async onlineListings(
    manager: EntityManager,
    userId: string,
    itemId?: string,
  ): Promise<OnlineListing[]> {
    const qb = manager
      .createQueryBuilder(MarketplaceProjectionEntity, 'p')
      .innerJoin(CanonicalListingEntity, 'l', 'l.id = p.canonical_listing_id')
      .innerJoin(ItemEntity, 'i', 'i.id = l.item_id')
      .select('l.id', 'listing_id')
      .addSelect('i.id', 'item_id')
      .addSelect('i.title', 'title')
      .addSelect('l.selling_price', 'selling_price')
      .addSelect('l.description_text', 'description_text')
      .addSelect('p.marketplace_id', 'marketplace_id')
      .addSelect('p.online_since', 'online_since')
      .where('p.status = :status', { status: 'ONLINE' })
      .andWhere('i.user_id = :userId', { userId })
      .andWhere('p.online_since IS NOT NULL');
    if (itemId) qb.andWhere('i.id = :itemId', { itemId });

    const rows = await qb.getRawMany<Record<string, unknown>>();
    const byListing = new Map<string, OnlineListing>();
    for (const row of rows) {
      const listingId = String(readRaw(row, 'listing_id'));
      const onlineSince = asDate(readRaw(row, 'online_since'));
      const existing = byListing.get(listingId);
      if (existing && existing.onlineSince <= onlineSince) continue;
      byListing.set(listingId, {
        listingId,
        itemId: String(readRaw(row, 'item_id')),
        title: (readRaw(row, 'title') as string | null) ?? null,
        sellingPrice: Number(readRaw(row, 'selling_price')),
        descriptionText: String(readRaw(row, 'description_text') ?? ''),
        marketplaceId: String(readRaw(row, 'marketplace_id')),
        onlineSince,
      });
    }
    return [...byListing.values()];
  }

  private async listingIdsForItem(
    manager: EntityManager,
    itemId: string,
  ): Promise<string[]> {
    const listings = await manager.find(CanonicalListingEntity, {
      where: { itemId },
      select: { id: true },
    });
    return listings.map((listing) => listing.id);
  }

  private async priceChanges(
    manager: EntityManager,
    listingIds: string[],
  ): Promise<PriceChangeView[]> {
    if (listingIds.length === 0) return [];
    const rows = await manager.find(ListingPriceChangeEntity, {
      where: { canonicalListingId: In(listingIds) },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => toPriceChangeView(row, row.createdAt));
  }

  private async targetPrices(
    manager: EntityManager,
    itemIds: string[],
  ): Promise<Map<string, number>> {
    const targets = new Map<string, number>();
    const unique = [...new Set(itemIds)];
    if (unique.length === 0) return targets;

    const rows = await manager.find(ItemPriceResearchEntity, {
      where: { itemId: In(unique) },
      order: { fetchedAt: 'DESC' },
    });
    const byItem = new Map<string, ItemPriceResearchEntity[]>();
    for (const row of rows) {
      byItem.set(row.itemId, [...(byItem.get(row.itemId) ?? []), row]);
    }

    for (const [itemId, itemRows] of byItem) {
      const newest = itemRows[0].fetchedAt.getTime();
      const batch = itemRows.filter(
        (row) => row.fetchedAt.getTime() === newest,
      );
      const sources: PriceResearchSourceResult[] = batch.map((row) => ({
        source: row.source,
        providerLabel: row.providerLabel,
        median: row.median,
        p25: row.p25,
        p75: row.p75,
        sampleSize: row.sampleSize,
        currency: row.currency,
        detail: row.rawResponse ?? undefined,
      }));
      const recommendation = this.priceRecommendation.recommend(sources, null);
      if (recommendation && recommendation.targetPrice > 0) {
        targets.set(itemId, recommendation.targetPrice);
      }
    }
    return targets;
  }
}

function toPriceChangeView(
  row: ListingPriceChangeEntity,
  changedAt: Date,
): PriceChangeView {
  return {
    id: row.id,
    listingId: row.canonicalListingId,
    previousPrice: roundMoney(row.previousPrice),
    newPrice: roundMoney(row.newPrice),
    note: row.note,
    followUpDays: row.followUpDays,
    changedAt: changedAt.toISOString(),
  };
}

function compareFollowUps(a: FollowUpCard, b: FollowUpCard): number {
  if (a.stage !== b.stage) return b.stage - a.stage;
  if (a.daysOnline !== b.daysOnline) return b.daysOnline - a.daysOnline;
  return (a.title ?? '').localeCompare(b.title ?? '', 'de');
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(String(value));
}

function readRaw(row: Record<string, unknown>, key: string): unknown {
  if (key in row) return row[key];
  const lower = key.toLowerCase();
  for (const [name, value] of Object.entries(row)) {
    if (name.toLowerCase() === lower) return value;
  }
  return undefined;
}
