import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CanonicalListingEntity, MarketplaceProjectionEntity } from '../../infrastructure/database/entities';

export interface ListingSummary {
  id: string;
  sellingPrice: number;
  descriptionText: string;
  projections: {
    id: string;
    marketplaceId: string;
    status: string;
    externalPlatformId: string | null;
  }[];
}

/**
 * Read-only Aggregation für Dashboards (README §"Zentrales Dashboard: Status
 * pro Listing pro Plattform"). Kein eigener Schreibpfad — Mutationen laufen
 * weiterhin ausschließlich über StateGuardService/CanonicalListingService.
 */
@Injectable()
export class ListingSummaryService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async forItemIds(itemIds: string[]): Promise<Map<string, ListingSummary[]>> {
    return this.build('item_id', itemIds);
  }

  async forItem(itemId: string): Promise<ListingSummary[]> {
    return (await this.forItemIds([itemId])).get(itemId) ?? [];
  }

  async forBundleIds(bundleIds: string[]): Promise<Map<string, ListingSummary[]>> {
    return this.build('bundle_id', bundleIds);
  }

  async forBundle(bundleId: string): Promise<ListingSummary[]> {
    return (await this.forBundleIds([bundleId])).get(bundleId) ?? [];
  }

  private async build(
    ownerColumn: 'item_id' | 'bundle_id',
    ownerIds: string[],
  ): Promise<Map<string, ListingSummary[]>> {
    const result = new Map<string, ListingSummary[]>();
    if (ownerIds.length === 0) return result;

    const listings = await this.dataSource
      .createQueryBuilder(CanonicalListingEntity, 'l')
      .where(`l.${ownerColumn} IN (:...ownerIds)`, { ownerIds })
      .getMany();
    if (listings.length === 0) return result;

    const listingIds = listings.map((l) => l.id);
    const projections = await this.dataSource
      .createQueryBuilder(MarketplaceProjectionEntity, 'p')
      .where('p.canonical_listing_id IN (:...listingIds)', { listingIds })
      .getMany();

    for (const listing of listings) {
      const ownerId = ownerColumn === 'item_id' ? listing.itemId : listing.bundleId;
      if (!ownerId) continue;
      const summary: ListingSummary = {
        id: listing.id,
        sellingPrice: listing.sellingPrice,
        descriptionText: listing.descriptionText,
        projections: projections
          .filter((p) => p.canonicalListingId === listing.id)
          .map((p) => ({
            id: p.id,
            marketplaceId: p.marketplaceId,
            status: p.status,
            externalPlatformId: p.externalPlatformId,
          })),
      };
      result.set(ownerId, [...(result.get(ownerId) ?? []), summary]);
    }
    return result;
  }
}
