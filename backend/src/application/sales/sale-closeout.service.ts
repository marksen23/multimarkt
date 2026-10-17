import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { computeSaleCloseout } from '../../domain/pricing/sale-closeout';
import {
  CanonicalListingEntity,
  ItemEntity,
  MarketplaceProjectionEntity,
  SaleEventEntity,
} from '../../infrastructure/database/entities';

export interface SaleCloseoutDraft {
  proceedsEur: number;
  portal: string;
  feeEur: number;
  shippingEur: number;
  paymentMethod: string | null;
}

/**
 * Schreibt den Abschluss auf den Artikel, nachdem er verkauft ist.
 * Der Nettogewinn wird einmal gegen den aktuellen Einstand gerechnet
 * und so gespeichert.
 */
@Injectable()
export class SaleCloseoutService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Nach `mark-sold`, wenn die Auswertung auf SOLD gelaufen ist.
   * Bundles haben keinen eigenen Artikel-Abschluss. Ein zweiter Aufruf
   * überschreibt nichts.
   */
  async recordForListingProjection(projectionId: string, draft: SaleCloseoutDraft): Promise<void> {
    const projection = await this.dataSource.manager.findOneBy(MarketplaceProjectionEntity, {
      id: projectionId,
    });
    if (!projection) return;
    const listing = await this.dataSource.manager.findOneBy(CanonicalListingEntity, {
      id: projection.canonicalListingId,
    });
    if (!listing?.itemId) return;

    await this.dataSource.transaction(async (manager) => {
      const item = await this.lockItem(manager, listing.itemId!);
      if (!item || item.status !== 'SOLD' || item.saleProceedsEur != null) return;
      await this.apply(manager, item, draft);
    });
  }

  async recordForSoldItem(itemId: string, draft: SaleCloseoutDraft): Promise<ItemEntity> {
    return this.dataSource.transaction(async (manager) => {
      const item = await this.lockItem(manager, itemId);
      if (!item) throw new NotFoundException(`Item ${itemId} not found`);
      if (item.status !== 'SOLD') {
        throw new BadRequestException('Ein Abschluss gilt nur für verkaufte Artikel.');
      }
      if (item.saleProceedsEur != null) {
        throw new BadRequestException('Der Abschluss ist schon erfasst.');
      }
      return this.apply(manager, item, draft);
    });
  }

  private async lockItem(manager: EntityManager, itemId: string): Promise<ItemEntity | null> {
    return manager.findOne(ItemEntity, {
      where: { id: itemId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private async apply(
    manager: EntityManager,
    item: ItemEntity,
    draft: SaleCloseoutDraft,
  ): Promise<ItemEntity> {
    const portal = draft.portal.trim();
    if (!portal) throw new BadRequestException('Portal fehlt.');
    const result = computeSaleCloseout({
      proceedsEur: draft.proceedsEur,
      feeEur: draft.feeEur,
      shippingEur: draft.shippingEur,
      purchasePriceEur: item.purchasePriceEur,
    });
    item.saleProceedsEur = result.proceedsEur;
    item.salePortal = portal;
    item.saleFeeEur = result.feeEur;
    item.saleShippingEur = result.shippingEur;
    item.salePaymentMethod = blankToNull(draft.paymentMethod);
    item.salePurchasePriceEur = result.purchasePriceEur;
    item.saleNetProfitEur = result.netProfitEur;
    item.soldAt = await this.winningReportedAt(manager, item.id);
    return manager.save(item);
  }

  private async winningReportedAt(manager: EntityManager, itemId: string): Promise<Date> {
    const winner = await manager
      .createQueryBuilder(SaleEventEntity, 'se')
      .innerJoin(MarketplaceProjectionEntity, 'p', 'p.id = se.projection_id')
      .innerJoin(CanonicalListingEntity, 'l', 'l.id = p.canonical_listing_id')
      .where('l.item_id = :itemId', { itemId })
      .andWhere('se.is_winner = true')
      .orderBy('se.reported_at', 'DESC')
      .getOne();
    return winner?.reportedAt ?? new Date();
  }
}

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
