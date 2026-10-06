import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BackupPhotoSource,
  backupFilename,
  buildBackupDocument,
} from '../../domain/export/backup-document';
import {
  MonthPurchaseRow,
  MonthSaleRow,
  MonthlySummary,
  berlinMonth,
  parseMonth,
  summarizeMonth,
} from '../../domain/export/monthly-summary';
import { ItemEntity } from '../../infrastructure/database/entities';

export interface MonthlySummaryResponse extends MonthlySummary {
  currentMonth: string;
}

export interface BackupFile {
  filename: string;
  body: string;
}

/**
 * Lesende Sicherung und Monatszahl (Feature-Plan 3.12). Schreibt nichts.
 * Einkäufe nach `purchase_date`, Verkäufe nach `sold_at` in Europe/Berlin.
 * „Noch online“ ist der aktuelle Bestand, nicht der gewählte Monat.
 */
@Injectable()
export class BackupExportService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async month(
    userId: string,
    monthParam?: string,
    now = new Date(),
  ): Promise<MonthlySummaryResponse> {
    const currentMonth = berlinMonth(now);
    const requested = monthParam?.trim() ? monthParam.trim() : currentMonth;
    const window = parseMonth(requested);
    if (!window) {
      throw new BadRequestException('Der Monat muss die Form JJJJ-MM haben.');
    }

    const [purchases, sales, onlineCount] = await Promise.all([
      this.purchases(userId, window.start, window.end),
      this.sales(userId, window.start, window.end),
      this.onlineCount(userId),
    ]);

    return {
      ...summarizeMonth({ window, purchases, sales, onlineCount }),
      currentMonth,
    };
  }

  async file(userId: string, now = new Date()): Promise<BackupFile> {
    const [items, photos] = await Promise.all([
      this.dataSource.manager.find(ItemEntity, {
        where: { userId },
        order: { createdAt: 'ASC' },
      }),
      this.photos(userId),
    ]);
    return {
      filename: backupFilename(now),
      body: JSON.stringify(buildBackupDocument(items, photos, now), null, 2),
    };
  }

  private async purchases(
    userId: string,
    start: string,
    end: string,
  ): Promise<MonthPurchaseRow[]> {
    const rows: Array<{ purchase_price_eur: string | number | null }> =
      await this.dataSource.query(
        `
      SELECT purchase_price_eur
      FROM items
      WHERE user_id = $1
        AND purchase_date IS NOT NULL
        AND purchase_date >= $2::date
        AND purchase_date <= $3::date
      `,
        [userId, start, end],
      );
    return rows.map((row) => ({
      purchasePriceEur: money(row.purchase_price_eur),
    }));
  }

  private async sales(
    userId: string,
    start: string,
    end: string,
  ): Promise<MonthSaleRow[]> {
    const rows: Array<{
      sale_proceeds_eur: string | number | null;
      sale_net_profit_eur: string | number | null;
    }> = await this.dataSource.query(
      `
      SELECT sale_proceeds_eur, sale_net_profit_eur
      FROM items
      WHERE user_id = $1
        AND status = 'SOLD'
        AND sold_at IS NOT NULL
        AND (sold_at AT TIME ZONE 'Europe/Berlin')::date >= $2::date
        AND (sold_at AT TIME ZONE 'Europe/Berlin')::date <= $3::date
      `,
      [userId, start, end],
    );
    return rows.map((row) => ({
      proceedsEur: money(row.sale_proceeds_eur),
      netProfitEur: money(row.sale_net_profit_eur),
    }));
  }

  private async onlineCount(userId: string): Promise<number> {
    const rows: Array<{ online_count: string | number }> =
      await this.dataSource.query(
        `
      SELECT count(DISTINCT listing.id)::int AS online_count
      FROM canonical_listings listing
      JOIN marketplace_projections projection
        ON projection.canonical_listing_id = listing.id
      WHERE listing.user_id = $1
        AND projection.status = 'ONLINE'
      `,
        [userId],
      );
    return Number(rows[0]?.online_count ?? 0);
  }

  private async photos(userId: string): Promise<BackupPhotoSource[]> {
    const rows: Array<{
      id: string;
      itemId: string;
      title: string | null;
      url: string;
      storageKey: string;
      shot: string | null;
      createdAt: Date | string;
    }> = await this.dataSource.query(
      `
      SELECT photo.id,
             photo.item_id AS "itemId",
             item.title AS title,
             photo.url,
             photo.storage_key AS "storageKey",
             photo.shot,
             photo.created_at AS "createdAt"
      FROM item_photos photo
      INNER JOIN items item ON item.id = photo.item_id
      WHERE item.user_id = $1
      ORDER BY photo.created_at ASC, photo.id ASC
      `,
      [userId],
    );
    return rows;
  }
}

function money(value: string | number | null): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
