import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SalesOverviewService } from './sales-overview.service';

const now = new Date('2026-11-27T12:00:00.000Z');

function sold(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    title: 'Jacke',
    created_at: new Date('2026-11-01T08:00:00.000Z'),
    sale_portal: 'ebay',
    sale_proceeds_eur: '40.00',
    sale_fee_eur: '4.00',
    sale_shipping_eur: '5.00',
    sale_purchase_price_eur: '15.00',
    sale_net_profit_eur: '16.00',
    sale_payment_method: 'PayPal',
    sale_buyer: 'Max',
    sale_notes: null,
    sold_at: new Date('2026-11-11T12:00:00.000Z'),
    sale_date: '2026-11-11',
    ...overrides,
  };
}

describe('SalesOverviewService', () => {
  function serviceWith(rows: unknown[]): SalesOverviewService {
    const query = jest.fn(async () => rows);
    return new SalesOverviewService({ query } as unknown as DataSource);
  }

  it('rejects an unknown period before reading the database', async () => {
    const query = jest.fn();
    const service = new SalesOverviewService({ query } as unknown as DataSource);
    await expect(service.overview('user-1', 'quartal', now)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('keeps last year out of this month and still counts this calendar year for DAC7', async () => {
    const service = serviceWith([
      sold(),
      sold({
        id: 'item-2',
        title: 'Lampe',
        sale_portal: 'Vinted',
        sale_proceeds_eur: '2000.00',
        sale_fee_eur: '0',
        sale_shipping_eur: '0',
        sale_purchase_price_eur: null,
        sale_net_profit_eur: null,
        sale_date: '2025-12-01',
        sold_at: new Date('2025-12-01T12:00:00.000Z'),
        created_at: new Date('2025-11-01T08:00:00.000Z'),
      }),
    ]);

    const month = await service.overview('user-1', 'this_month', now);
    expect(month.items.map((item) => item.id)).toEqual(['item-1']);
    expect(month.kpis).toMatchObject({
      salesCount: 1,
      proceedsEur: 40,
      feesAndShippingEur: 9,
      purchaseCostEur: 15,
      netProfitEur: 16,
      averageDaysToSale: 10,
    });
    expect(month.channels).toEqual([
      expect.objectContaining({ channel: 'eBay', salesCount: 1, netProfitEur: 16 }),
    ]);
    expect(month.dac7.map((entry) => [entry.channel, entry.year, entry.thresholdReached])).toEqual([
      ['eBay', 2026, false],
    ]);

    const lastYear = await service.overview('user-1', 'last_year', now);
    expect(lastYear.items.map((item) => item.id)).toEqual(['item-2']);
    expect(lastYear.kpis.netProfitEur).toBeNull();
    expect(lastYear.dac7).toEqual([
      expect.objectContaining({ channel: 'eBay', year: 2026, salesCount: 1 }),
    ]);
  });

  it('exports the filtered rows as German CSV', async () => {
    const service = serviceWith([sold({ title: 'Jacke; Winter' })]);
    const file = await service.csv('user-1', 'this_month', now);
    expect(file.filename).toBe('verkaeufe-2026-11-01_2026-11-30.csv');
    expect(file.body.charCodeAt(0)).toBe(0xfeff);
    expect(file.body).toContain('11.11.2026;"Jacke; Winter";eBay;40,00;4,00;5,00;15,00;16,00');
    expect(file.body).toContain('Max');

    const all = await service.csv('user-1', 'all', now);
    expect(all.filename).toBe('verkaeufe-alle.csv');
  });

  it('uses the Berlin day of sold_at when the sale date column is empty', async () => {
    const service = serviceWith([
      sold({
        sale_date: null,
        sold_at: new Date('2026-10-31T23:30:00.000Z'),
      }),
    ]);
    const october = await service.overview('user-1', 'last_month', now);
    expect(october.items).toHaveLength(0);

    const november = await service.overview('user-1', 'this_month', now);
    expect(november.items).toHaveLength(1);
    expect(november.items[0]?.saleDate).toBe('2026-11-01');
  });
});
