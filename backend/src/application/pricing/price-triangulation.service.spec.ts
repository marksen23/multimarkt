import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MarketDistributionProvider } from '../../domain/pricing/market-distribution-provider.interface';
import { BuybackAnchorProvider } from '../../domain/pricing/buyback-anchor-provider.interface';
import { ItemAttributeEntity, ItemEntity } from '../../infrastructure/database/entities';
import { BUYBACK_TO_RESALE_MULTIPLIER, PriceTriangulationService } from './price-triangulation.service';

function makeDataSource(opts: {
  item: Partial<ItemEntity> | null;
  attributes: Partial<ItemAttributeEntity>[];
}) {
  const insert = jest.fn().mockResolvedValue(undefined);
  const findOneBy = jest.fn().mockResolvedValue(opts.item);
  const find = jest.fn().mockResolvedValue(opts.attributes);
  const dataSource = { manager: { findOneBy, find, insert } } as unknown as DataSource;
  return { dataSource, insert, findOneBy, find };
}

function attr(key: string, value: string | null): Partial<ItemAttributeEntity> {
  return { attributeKey: key, attributeValue: value };
}

describe('PriceTriangulationService', () => {
  let marketProvider: jest.Mocked<MarketDistributionProvider>;
  let buybackProvider: jest.Mocked<BuybackAnchorProvider>;

  beforeEach(() => {
    marketProvider = { search: jest.fn() };
    buybackProvider = { quote: jest.fn() };
  });

  it('throws NotFoundException when the item does not exist', async () => {
    const { dataSource } = makeDataSource({ item: null, attributes: [] });
    const service = new PriceTriangulationService(dataSource, marketProvider, buybackProvider);

    await expect(service.research('missing-id')).rejects.toThrow(NotFoundException);
  });

  it('combines both sources when brand+category are known and both providers answer', async () => {
    const { dataSource, insert } = makeDataSource({
      item: { id: 'i1', condition: 'good' },
      attributes: [attr('brand', 'Nike'), attr('category', 'Sneaker')],
    });
    marketProvider.search.mockResolvedValue({
      median: 34,
      p25: 28,
      p75: 41,
      sampleSize: 12,
      currency: 'EUR',
      providerLabel: 'eBay Browse API (Mock)',
      comparableListings: [{ title: 'Nike Sneaker, guter Zustand', price: 34 }],
    });
    buybackProvider.quote.mockResolvedValue({
      buybackPrice: 15,
      currency: 'EUR',
      portalName: 'momox (Mock)',
    });

    const service = new PriceTriangulationService(dataSource, marketProvider, buybackProvider);
    const result = await service.research('i1');

    expect(result.sources).toHaveLength(2);
    const market = result.sources.find((s) => s.source === 'EBAY_ACTIVE_LISTINGS');
    const buyback = result.sources.find((s) => s.source === 'ANKAUF_PORTAL');
    expect(market?.median).toBe(34);
    expect(market?.detail?.comparableListings).toHaveLength(1);
    expect(buyback?.median).toBe(15 * BUYBACK_TO_RESALE_MULTIPLIER);
    expect(marketProvider.search).toHaveBeenCalledWith({ keywords: 'Nike Sneaker', condition: 'good' });
    expect(insert).toHaveBeenCalledTimes(1);
    const insertedRows = insert.mock.calls[0][1] as Array<{ source: string }>;
    expect(insertedRows).toHaveLength(2);
  });

  it('excludes the market source when the sample size is below the minimum', async () => {
    const { dataSource } = makeDataSource({
      item: { id: 'i1', condition: 'good' },
      attributes: [attr('brand', 'Nike'), attr('category', 'Sneaker')],
    });
    marketProvider.search.mockResolvedValue({
      median: 34,
      p25: 28,
      p75: 41,
      sampleSize: 2, // unter MIN_MARKET_SAMPLE_SIZE (5)
      currency: 'EUR',
      providerLabel: 'eBay Browse API (Mock)',
      comparableListings: [],
    });
    buybackProvider.quote.mockResolvedValue(null);

    const service = new PriceTriangulationService(dataSource, marketProvider, buybackProvider);
    const result = await service.research('i1');

    expect(result.sources).toHaveLength(0);
  });

  it('skips the market lookup entirely when no brand/category attribute is known', async () => {
    const { dataSource } = makeDataSource({
      item: { id: 'i1', condition: 'good' },
      attributes: [],
    });
    buybackProvider.quote.mockResolvedValue(null);

    const service = new PriceTriangulationService(dataSource, marketProvider, buybackProvider);
    const result = await service.research('i1');

    expect(marketProvider.search).not.toHaveBeenCalled();
    expect(result.sources).toHaveLength(0);
  });

  it('omits the buyback source when the provider cannot quote (e.g. no brand)', async () => {
    const { dataSource } = makeDataSource({
      item: { id: 'i1', condition: 'good' },
      attributes: [attr('category', 'Sneaker')],
    });
    marketProvider.search.mockResolvedValue({
      median: 34,
      p25: 28,
      p75: 41,
      sampleSize: 12,
      currency: 'EUR',
      providerLabel: 'eBay Browse API (Mock)',
      comparableListings: [{ title: 'Nike Sneaker, guter Zustand', price: 34 }],
    });
    buybackProvider.quote.mockResolvedValue(null);

    const service = new PriceTriangulationService(dataSource, marketProvider, buybackProvider);
    const result = await service.research('i1');

    expect(result.sources.map((s) => s.source)).toEqual(['EBAY_ACTIVE_LISTINGS']);
  });

  it('never persists rows when no source produced a result', async () => {
    const { dataSource, insert } = makeDataSource({
      item: { id: 'i1', condition: 'good' },
      attributes: [],
    });
    buybackProvider.quote.mockResolvedValue(null);

    const service = new PriceTriangulationService(dataSource, marketProvider, buybackProvider);
    await service.research('i1');

    expect(insert).not.toHaveBeenCalled();
  });
});
