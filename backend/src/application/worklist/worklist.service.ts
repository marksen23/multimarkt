import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import {
  BundleEntity,
  BundleItemEntity,
  CanonicalListingEntity,
  ItemEntity,
  ItemPhotoEntity,
  MarketplaceProjectionEntity,
} from '../../infrastructure/database/entities';
import {
  ListingSummary,
  ListingSummaryService,
} from '../listing/listing-summary.service';
import {
  BundleWorklistHit,
  ClassifiedWorklist,
  ItemWorklistHit,
  STALE_ONLINE_DAYS,
  WORKLIST_GROUP_IDS,
  WorklistGroupId,
  WorklistProjectionRef,
  classifyWorklist,
} from './worklist.classifier';

export interface WorklistItemEntry {
  kind: 'item';
  reason: ItemWorklistHit['reason'];
  onlineSince: string | null;
  staleDays: number | null;
  item: ItemEntity;
  listings: ListingSummary[];
  thumbnailUrl: string | null;
}

export interface WorklistBundleEntry {
  kind: 'bundle';
  reason: BundleWorklistHit['reason'];
  itemCount: number;
  bundle: BundleEntity;
}

export type WorklistEntry = WorklistItemEntry | WorklistBundleEntry;

export interface WorklistGroup {
  id: WorklistGroupId;
  entries: WorklistEntry[];
}

export interface WorklistView {
  staleOnlineDays: number;
  groups: WorklistGroup[];
  otherItems: {
    item: ItemEntity;
    listings: ListingSummary[];
    thumbnailUrl: string | null;
  }[];
}

/**
 * Read-only Abfrage für die gruppierte Startseite. Schreibt nichts und
 * hängt kein Erinnerungsfeld an — die Gruppen kommen aus Item-/Bundle-
 * Status plus `marketplace_projections.updated_at` (siehe Classifier).
 */
@Injectable()
export class WorklistService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly listingSummary: ListingSummaryService,
  ) {}

  async forUser(userId: string, now: Date = new Date()): Promise<WorklistView> {
    const items = await this.dataSource.manager.find(ItemEntity, {
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const itemIds = items.map((item) => item.id);
    const listingsByItem = await this.listingSummary.forItemIds(itemIds);
    const thumbnailByItem = await this.thumbnailsFor(itemIds);
    const projectionsByItem = await this.projectionsFor(itemIds);

    const bundles = await this.dataSource.manager.find(BundleEntity, {
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const itemCountByBundle = await this.itemCountsFor(
      bundles.map((bundle) => bundle.id),
    );

    const classified = classifyWorklist({
      now,
      items: items.map((item) => ({
        id: item.id,
        status: item.status,
        projections: projectionsByItem.get(item.id) ?? [],
      })),
      bundles: bundles.map((bundle) => ({
        id: bundle.id,
        status: bundle.status,
        itemCount: itemCountByBundle.get(bundle.id) ?? 0,
      })),
    });

    return this.assemble(
      items,
      bundles,
      listingsByItem,
      thumbnailByItem,
      itemCountByBundle,
      classified,
    );
  }

  private assemble(
    items: ItemEntity[],
    bundles: BundleEntity[],
    listingsByItem: Map<string, ListingSummary[]>,
    thumbnailByItem: Map<string, string>,
    itemCountByBundle: Map<string, number>,
    classified: ClassifiedWorklist,
  ): WorklistView {
    const groups: WorklistGroup[] = WORKLIST_GROUP_IDS.map((id) => ({
      id,
      entries: [],
    }));
    const groupById = new Map(groups.map((group) => [group.id, group]));
    const otherItems: WorklistView['otherItems'] = [];

    for (const item of items) {
      const card = {
        item,
        listings: listingsByItem.get(item.id) ?? [],
        thumbnailUrl: thumbnailByItem.get(item.id) ?? null,
      };
      const hit = classified.items.get(item.id);
      if (!hit) {
        otherItems.push(card);
        continue;
      }
      groupById.get(hit.groupId)?.entries.push({
        kind: 'item',
        reason: hit.reason,
        onlineSince: hit.onlineSince,
        staleDays: hit.staleDays,
        ...card,
      });
    }

    for (const bundle of bundles) {
      const hit = classified.bundles.get(bundle.id);
      if (!hit) continue;
      groupById.get(hit.groupId)?.entries.push({
        kind: 'bundle',
        reason: hit.reason,
        itemCount: itemCountByBundle.get(bundle.id) ?? 0,
        bundle,
      });
    }

    return { staleOnlineDays: STALE_ONLINE_DAYS, groups, otherItems };
  }

  /** Dieselbe erste-Foto-Regel wie `ItemsController.list`. */
  private async thumbnailsFor(itemIds: string[]): Promise<Map<string, string>> {
    const thumbnailByItem = new Map<string, string>();
    if (itemIds.length === 0) return thumbnailByItem;
    const photos = await this.dataSource.manager
      .createQueryBuilder(ItemPhotoEntity, 'p')
      .where('p.item_id IN (:...itemIds)', { itemIds })
      .orderBy('p.created_at', 'ASC')
      .getMany();
    for (const photo of photos) {
      if (!thumbnailByItem.has(photo.itemId))
        thumbnailByItem.set(photo.itemId, photo.url);
    }
    return thumbnailByItem;
  }

  private async projectionsFor(
    itemIds: string[],
  ): Promise<Map<string, WorklistProjectionRef[]>> {
    const byItem = new Map<string, WorklistProjectionRef[]>();
    if (itemIds.length === 0) return byItem;

    const listings = await this.dataSource.manager
      .createQueryBuilder(CanonicalListingEntity, 'l')
      .where('l.item_id IN (:...itemIds)', { itemIds })
      .getMany();
    if (listings.length === 0) return byItem;

    const itemIdByListing = new Map(
      listings.map((listing) => [listing.id, listing.itemId]),
    );
    const projections = await this.dataSource.manager
      .createQueryBuilder(MarketplaceProjectionEntity, 'p')
      .where('p.canonical_listing_id IN (:...listingIds)', {
        listingIds: listings.map((listing) => listing.id),
      })
      .getMany();

    for (const projection of projections) {
      const itemId = itemIdByListing.get(projection.canonicalListingId);
      if (!itemId) continue;
      const list = byItem.get(itemId) ?? [];
      list.push({ status: projection.status, updatedAt: projection.updatedAt });
      byItem.set(itemId, list);
    }
    return byItem;
  }

  private async itemCountsFor(
    bundleIds: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (bundleIds.length === 0) return counts;
    const memberships = await this.dataSource.manager.find(BundleItemEntity, {
      where: { bundleId: In(bundleIds) },
    });
    for (const membership of memberships) {
      counts.set(
        membership.bundleId,
        (counts.get(membership.bundleId) ?? 0) + 1,
      );
    }
    return counts;
  }
}
