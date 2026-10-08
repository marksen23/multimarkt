import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, Not } from 'typeorm';
import { roundMoney } from '../../domain/pricing/expected-margin';
import { ItemLifecycleState } from '../../domain/state-vocabulary';
import { buildWeekRows, recentWeekStarts, WeekRow } from '../../domain/sales/recent-weeks';
import { CanonicalListingEntity, ItemEntity } from '../../infrastructure/database/entities';

const CLOSED: ItemLifecycleState[] = ['SOLD', 'CANCELLED', 'ARCHIVED'];

export interface OpenItemRow {
  id: string;
  title: string | null;
  status: ItemLifecycleState;
  purchasePriceEur: number | null;
  askingPriceEur: number | null;
}

export interface SoldItemRow {
  id: string;
  title: string | null;
  soldAt: string | null;
  portal: string | null;
  proceedsEur: number | null;
  feeEur: number | null;
  shippingEur: number | null;
  paymentMethod: string | null;
  purchasePriceEur: number | null;
  netProfitEur: number | null;
}

export interface SalesOverview {
  weeks: WeekRow[];
  openItems: OpenItemRow[];
  soldItems: SoldItemRow[];
}

/**
 * Eine Tabelle für einen Einzelverkäufer: offene Artikel, verkaufte
 * Artikel, Marge der letzten Wochen. Keine Konten, keine Periodenabgrenzung.
 */
@Injectable()
export class SalesOverviewService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async overview(userId: string, now = new Date()): Promise<SalesOverview> {
    const weekStarts = recentWeekStarts(now);
    const [weeks, openItems, soldItems] = await Promise.all([
      this.weeks(userId, weekStarts),
      this.openItems(userId),
      this.soldItems(userId),
    ]);
    return { weeks, openItems, soldItems };
  }

  private async weeks(userId: string, weekStarts: string[]): Promise<WeekRow[]> {
    const rows: Array<{
      week_start: string;
      sales_count: number;
      profit_count: number;
      net_profit_eur: string | number;
    }> = await this.dataSource.query(
      `
      SELECT to_char(date_trunc('week', sold_at AT TIME ZONE 'Europe/Berlin'), 'YYYY-MM-DD') AS week_start,
             count(*)::int AS sales_count,
             count(sale_net_profit_eur)::int AS profit_count,
             coalesce(sum(sale_net_profit_eur), 0) AS net_profit_eur
      FROM items
      WHERE user_id = $1
        AND status = 'SOLD'
        AND sold_at IS NOT NULL
        AND (sold_at AT TIME ZONE 'Europe/Berlin')::date >= $2::date
      GROUP BY 1
      `,
      [userId, weekStarts[0]],
    );

    const byWeek = new Map(
      rows.map((row) => [
        String(row.week_start).slice(0, 10),
        {
          salesCount: Number(row.sales_count),
          profitCount: Number(row.profit_count),
          netProfitEur: roundMoney(Number(row.net_profit_eur)),
        },
      ]),
    );
    return buildWeekRows(weekStarts, byWeek);
  }

  private async openItems(userId: string): Promise<OpenItemRow[]> {
    const items = await this.dataSource.manager.find(ItemEntity, {
      where: { userId, status: Not(In(CLOSED)) },
      order: { updatedAt: 'DESC' },
    });
    const asking = await this.askingPrices(items.map((item) => item.id));
    return items.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      purchasePriceEur: item.purchasePriceEur,
      askingPriceEur: asking.get(item.id) ?? null,
    }));
  }

  private async soldItems(userId: string): Promise<SoldItemRow[]> {
    const items = await this.dataSource
      .createQueryBuilder(ItemEntity, 'item')
      .where('item.user_id = :userId', { userId })
      .andWhere('item.status = :status', { status: 'SOLD' })
      .orderBy('item.sold_at', 'DESC', 'NULLS LAST')
      .addOrderBy('item.updated_at', 'DESC')
      .getMany();
    return items.map((item) => ({
      id: item.id,
      title: item.title,
      soldAt: item.soldAt ? item.soldAt.toISOString() : null,
      portal: item.salePortal,
      proceedsEur: item.saleProceedsEur,
      feeEur: item.saleFeeEur,
      shippingEur: item.saleShippingEur,
      paymentMethod: item.salePaymentMethod,
      purchasePriceEur: item.salePurchasePriceEur,
      netProfitEur: item.saleNetProfitEur,
    }));
  }

  private async askingPrices(itemIds: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    if (itemIds.length === 0) return prices;
    const listings = await this.dataSource
      .createQueryBuilder(CanonicalListingEntity, 'listing')
      .where('listing.item_id IN (:...itemIds)', { itemIds })
      .orderBy('listing.created_at', 'ASC')
      .getMany();
    for (const listing of listings) {
      if (listing.itemId && !prices.has(listing.itemId)) {
        prices.set(listing.itemId, listing.sellingPrice);
      }
    }
    return prices;
  }
}
