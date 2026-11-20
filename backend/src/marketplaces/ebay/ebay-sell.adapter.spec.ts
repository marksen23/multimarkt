import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EbaySellException } from '../../domain/errors/ebay-sell.exception';
import { createMarketplaceAdapters } from '../../application/listing/marketplace-publishing.module';
import { FormattingHelperAdapter } from '../kleinanzeigen/formatting-helper.adapter';
import { MockEbayAdapter } from './mock-ebay.adapter';
import { EbaySellAdapter } from './ebay-sell.adapter';

describe('EbaySellAdapter', () => {
  it('fails in German before touching the database when the sell setup is missing', async () => {
    const findOneByOrFail = jest.fn(() => {
      throw new Error('database should not be read');
    });
    const adapter = new EbaySellAdapter(
      { get: () => '' } as unknown as ConfigService,
      { manager: { findOneByOrFail } } as unknown as DataSource,
    );

    await expect(
      adapter.publish({
        projectionId: 'p1',
        canonicalListingId: 'l1',
        marketplaceId: 'EBAY',
        sellingPrice: 10,
        descriptionText: 'Text',
        fallbackData: {},
      }),
    ).rejects.toBeInstanceOf(EbaySellException);
    await expect(
      adapter.publish({
        projectionId: 'p1',
        canonicalListingId: 'l1',
        marketplaceId: 'EBAY',
        sellingPrice: 10,
        descriptionText: 'Text',
        fallbackData: {},
      }),
    ).rejects.toThrow(/EBAY_REFRESH_TOKEN/);
    expect(findOneByOrFail).not.toHaveBeenCalled();
  });
});

describe('createMarketplaceAdapters', () => {
  it('registers the sell adapter and never the mock that invents listing ids', () => {
    const adapters = createMarketplaceAdapters(
      new FormattingHelperAdapter(),
      new EbaySellAdapter({ get: () => '' } as unknown as ConfigService, {} as DataSource),
    );
    expect(adapters.get('EBAY')).toBeInstanceOf(EbaySellAdapter);
    expect(adapters.get('KLEINANZEIGEN')).toBeInstanceOf(FormattingHelperAdapter);
    expect([...adapters.values()].some((adapter) => adapter instanceof MockEbayAdapter)).toBe(false);
  });
});
