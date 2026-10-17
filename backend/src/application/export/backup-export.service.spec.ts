import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ItemEntity } from '../../infrastructure/database/entities';
import { BackupExportService } from './backup-export.service';

const now = new Date('2026-10-06T12:00:00+02:00');

describe('BackupExportService', () => {
  function serviceWith(query: jest.Mock): BackupExportService {
    return new BackupExportService({ query } as unknown as DataSource);
  }

  it('rejects a month that is not JJJJ-MM', async () => {
    const query = jest.fn();
    await expect(
      serviceWith(query).month('user-1', 'Oktober', now),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('sums the selected month and keeps the online count as a snapshot', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('purchase_date')) {
        return [{ purchase_price_eur: '12.50' }, { purchase_price_eur: null }];
      }
      if (sql.includes('sold_at')) {
        return [{ sale_proceeds_eur: '20.00', sale_net_profit_eur: '4.50' }];
      }
      return [{ online_count: 3 }];
    });

    const summary = await serviceWith(query).month('user-1', '2026-09', now);

    expect(summary).toMatchObject({
      month: '2026-09',
      monthStart: '2026-09-01',
      monthEnd: '2026-09-30',
      purchasedCount: 2,
      purchasedEur: 12.5,
      soldCount: 1,
      soldEur: 20,
      marginEur: 4.5,
      onlineCount: 3,
      currentMonth: '2026-10',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('purchase_date'),
      ['user-1', '2026-09-01', '2026-09-30'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'ONLINE'"),
      ['user-1'],
    );
  });

  it('uses the Berlin month when none is requested', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('ONLINE')) return [{ online_count: '0' }];
      return [];
    });
    const summary = await serviceWith(query).month('user-1', '  ', now);
    expect(summary.month).toBe('2026-10');
    expect(summary.purchasedEur).toBe(0);
    expect(summary.onlineCount).toBe(0);
  });

  it('writes articles, purchases, sales and the photo list into one file', async () => {
    const item = {
      id: 'item-1',
      title: 'Jacke',
      status: 'SOLD',
      condition: 'Gut',
      createdAt: new Date('2026-10-01T08:00:00.000Z'),
      updatedAt: new Date('2026-10-02T08:00:00.000Z'),
      weightGrams: null,
      lengthCm: null,
      widthCm: null,
      heightCm: null,
      logisticsBulky: false,
      pickupOnly: true,
      shippingPossible: false,
      postalCode: '10115',
      logisticsCaptured: true,
      purchasePriceEur: 8,
      purchasePortal: 'Kleinanzeigen',
      purchaseDate: '2026-10-01',
      purchaseCondition: 'Gut',
      purchaseUrl: null,
      saleProceedsEur: 20,
      salePortal: 'Vinted',
      saleFeeEur: 0,
      saleShippingEur: 0,
      salePaymentMethod: 'Bar',
      salePurchasePriceEur: 8,
      saleNetProfitEur: 12,
      soldAt: new Date('2026-10-04T10:00:00.000Z'),
    } as ItemEntity;
    const find = jest.fn(async () => [item]);
    const query = jest.fn(async () => [
      {
        id: 'photo-1',
        itemId: 'item-1',
        title: 'Jacke',
        url: '/uploads/jacke.jpg',
        storageKey: 'jacke.jpg',
        shot: null,
        createdAt: new Date('2026-10-01T09:00:00.000Z'),
      },
    ]);
    const dataSource = { manager: { find }, query } as unknown as DataSource;
    const file = await new BackupExportService(dataSource).file('user-1', now);
    const body = JSON.parse(file.body) as {
      articles: unknown[];
      purchases: Array<{ itemId: string }>;
      sales: Array<{ saleNetProfitEur: number }>;
      photos: Array<{ storageKey: string }>;
    };

    expect(file.filename).toBe('sicherung-2026-10-06.json');
    expect(find).toHaveBeenCalledWith(ItemEntity, {
      where: { userId: 'user-1' },
      order: { createdAt: 'ASC' },
    });
    expect(body.articles).toHaveLength(1);
    expect(body.purchases.map((row) => row.itemId)).toEqual(['item-1']);
    expect(body.sales[0].saleNetProfitEur).toBe(12);
    expect(body.photos[0].storageKey).toBe('jacke.jpg');
  });
});
