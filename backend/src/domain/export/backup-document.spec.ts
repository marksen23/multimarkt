import {
  BACKUP_NOTE,
  BackupArticleSource,
  backupFilename,
  buildBackupDocument,
} from './backup-document';

function item(
  overrides: Partial<BackupArticleSource> = {},
): BackupArticleSource {
  return {
    id: 'item-1',
    title: 'Jacke',
    status: 'LISTED',
    condition: 'Gut',
    createdAt: new Date('2026-10-01T08:00:00.000Z'),
    updatedAt: new Date('2026-10-02T08:00:00.000Z'),
    weightGrams: 400,
    lengthCm: 30,
    widthCm: 20,
    heightCm: 5,
    logisticsBulky: false,
    pickupOnly: false,
    shippingPossible: true,
    postalCode: '10115',
    logisticsCaptured: true,
    purchasePriceEur: null,
    purchasePortal: null,
    purchaseDate: null,
    purchaseCondition: null,
    purchaseUrl: null,
    saleProceedsEur: null,
    salePortal: null,
    saleFeeEur: null,
    saleShippingEur: null,
    salePaymentMethod: null,
    salePurchasePriceEur: null,
    saleNetProfitEur: null,
    soldAt: null,
    ...overrides,
  };
}

describe('buildBackupDocument', () => {
  const now = new Date('2026-10-06T18:00:00.000Z');

  it('splits articles, purchases, sales and the photo list', () => {
    const document = buildBackupDocument(
      [
        item({
          purchasePriceEur: 8,
          purchasePortal: 'Kleinanzeigen',
          purchaseDate: '2026-09-12',
          purchaseCondition: 'Gut',
          purchaseUrl: 'https://example.test/jacke',
        }),
        item({
          id: 'item-2',
          title: 'Lampe',
          status: 'SOLD',
          purchasePriceEur: 4,
          purchaseDate: '2026-10-01',
          saleProceedsEur: 15,
          salePortal: 'Vinted',
          saleFeeEur: 1,
          saleShippingEur: 2,
          salePaymentMethod: 'PayPal',
          salePurchasePriceEur: 4,
          saleNetProfitEur: 8,
          soldAt: new Date('2026-10-05T12:00:00.000Z'),
        }),
      ],
      [
        {
          id: 'photo-1',
          itemId: 'item-1',
          title: 'Jacke',
          url: '/uploads/jacke.jpg',
          storageKey: 'jacke.jpg',
          shot: 'overview',
          createdAt: '2026-10-01T09:00:00.000Z',
        },
      ],
      now,
    );

    expect(document.exportedAt).toBe('2026-10-06T18:00:00.000Z');
    expect(document.note).toBe(BACKUP_NOTE);
    expect(document.articles.map((article) => article.id)).toEqual([
      'item-1',
      'item-2',
    ]);
    expect(document.articles[0]).not.toHaveProperty('purchasePriceEur');
    expect(document.purchases).toEqual([
      {
        itemId: 'item-1',
        title: 'Jacke',
        purchasePriceEur: 8,
        purchasePortal: 'Kleinanzeigen',
        purchaseDate: '2026-09-12',
        purchaseCondition: 'Gut',
        purchaseUrl: 'https://example.test/jacke',
      },
      {
        itemId: 'item-2',
        title: 'Lampe',
        purchasePriceEur: 4,
        purchasePortal: null,
        purchaseDate: '2026-10-01',
        purchaseCondition: null,
        purchaseUrl: null,
      },
    ]);
    expect(document.sales).toEqual([
      {
        itemId: 'item-2',
        title: 'Lampe',
        soldAt: '2026-10-05T12:00:00.000Z',
        salePortal: 'Vinted',
        saleProceedsEur: 15,
        saleFeeEur: 1,
        saleShippingEur: 2,
        salePaymentMethod: 'PayPal',
        salePurchasePriceEur: 4,
        saleNetProfitEur: 8,
      },
    ]);
    expect(document.photos).toEqual([
      {
        id: 'photo-1',
        itemId: 'item-1',
        title: 'Jacke',
        url: '/uploads/jacke.jpg',
        storageKey: 'jacke.jpg',
        shot: 'overview',
        createdAt: '2026-10-01T09:00:00.000Z',
      },
    ]);
  });

  it('leaves purchases and sales empty when nothing was recorded', () => {
    const document = buildBackupDocument([item()], [], now);
    expect(document.purchases).toEqual([]);
    expect(document.sales).toEqual([]);
    expect(document.photos).toEqual([]);
  });
});

describe('backupFilename', () => {
  it('uses the Berlin calendar day', () => {
    expect(backupFilename(new Date('2026-10-06T21:30:00Z'))).toBe(
      'sicherung-2026-10-06.json',
    );
    expect(backupFilename(new Date('2026-10-06T22:30:00Z'))).toBe(
      'sicherung-2026-10-07.json',
    );
  });
});
