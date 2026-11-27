import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { berlinIsoDate } from '../../domain/sales/recent-weeks';
import {
  buildSalesCsv,
  canonicalChannel,
  ChannelBreakdown,
  dac7Progress,
  Dac7PlatformProgress,
  SaleLedgerRow,
  SalesKpis,
  salesCsvFilename,
  summarizeSales,
} from '../../domain/sales/sales-report';
import { inSalesPeriod, parseSalesPeriod, periodRange, SalesPeriod } from '../../domain/sales/sales-period';

export interface SalesOverview {
  period: SalesPeriod;
  from: string | null;
  to: string | null;
  year: number;
  kpis: SalesKpis;
  channels: ChannelBreakdown[];
  dac7: Dac7PlatformProgress[];
  items: SaleLedgerRow[];
}

export interface SalesCsvFile {
  filename: string;
  body: string;
}

interface SoldRow {
  id: string;
  title: string | null;
  created_at: Date | string;
  sale_portal: string | null;
  sale_proceeds_eur: string | number | null;
  sale_fee_eur: string | number | null;
  sale_shipping_eur: string | number | null;
  sale_purchase_price_eur: string | number | null;
  sale_net_profit_eur: string | number | null;
  sale_payment_method: string | null;
  sale_buyer: string | null;
  sale_notes: string | null;
  sold_at: Date | string | null;
  sale_date: Date | string | null;
}

/**
 * Eine Auswertung für einen Einzelverkäufer: Zeitraum, Kennzahlen,
 * Kanäle, DAC7-Zähler und die Zeilen für die CSV. Keine Buchhaltung.
 */
@Injectable()
export class SalesOverviewService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async overview(userId: string, periodParam?: string, now = new Date()): Promise<SalesOverview> {
    const period = this.period(periodParam);
    const rows = await this.load(userId);
    const range = periodRange(period, now);
    const selected = rows.filter((row) => inSalesPeriod(row.saleDate, range));
    const year = Number(berlinIsoDate(now).slice(0, 4));
    const summary = summarizeSales(selected);
    return {
      period,
      from: range.from,
      to: range.to,
      year,
      kpis: summary.kpis,
      channels: summary.channels,
      dac7: dac7Progress(rows, year),
      items: selected,
    };
  }

  async csv(userId: string, periodParam?: string, now = new Date()): Promise<SalesCsvFile> {
    const report = await this.overview(userId, periodParam, now);
    return {
      filename: salesCsvFilename(report.period, { from: report.from, to: report.to }),
      body: buildSalesCsv(report.items),
    };
  }

  private period(periodParam: string | undefined): SalesPeriod {
    const period = parseSalesPeriod(periodParam);
    if (period == null) {
      throw new BadRequestException(
        'Der Zeitraum ist unbekannt. Erlaubt sind this_month, last_month, this_year, last_year und all.',
      );
    }
    return period;
  }

  private async load(userId: string): Promise<SaleLedgerRow[]> {
    const rows: SoldRow[] = await this.dataSource.query(
      `
      SELECT id,
             title,
             created_at,
             sale_portal,
             sale_proceeds_eur,
             sale_fee_eur,
             sale_shipping_eur,
             sale_purchase_price_eur,
             sale_net_profit_eur,
             sale_payment_method,
             sale_buyer,
             sale_notes,
             sold_at,
             sale_date
      FROM items
      WHERE user_id = $1
        AND status = 'SOLD'
      ORDER BY COALESCE(sale_date, (sold_at AT TIME ZONE 'Europe/Berlin')::date) DESC NULLS LAST,
               sold_at DESC NULLS LAST,
               id ASC
      `,
      [userId],
    );
    return rows.map((row) => this.toLedger(row));
  }

  private toLedger(row: SoldRow): SaleLedgerRow {
    const saleDate = isoDay(row.sale_date) ?? (row.sold_at ? berlinIsoDate(asDate(row.sold_at)) : null);
    const createdOn = row.created_at ? berlinIsoDate(asDate(row.created_at)) : null;
    return {
      id: row.id,
      title: row.title,
      saleDate,
      createdOn,
      channel: canonicalChannel(row.sale_portal),
      proceedsEur: money(row.sale_proceeds_eur),
      feeEur: money(row.sale_fee_eur),
      shippingEur: money(row.sale_shipping_eur),
      purchasePriceEur: money(row.sale_purchase_price_eur),
      netProfitEur: money(row.sale_net_profit_eur),
      buyer: row.sale_buyer,
      notes: row.sale_notes,
      paymentMethod: row.sale_payment_method,
    };
  }
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function isoDay(value: Date | string | null): string | null {
  if (value == null) return null;
  const iso = (typeof value === 'string' ? value : value.toISOString()).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function money(value: string | number | null): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}
