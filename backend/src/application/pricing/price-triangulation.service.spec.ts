import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MarketDistributionProvider } from '../../domain/pricing/market-distribution-provider.interface';
import { BuybackAnchorProvider } from '../../domain/pricing/buyback-anchor-provider.interface';
import {
  ItemAttributeEntity,
  ItemEntity,
  ItemPriceResearchEntity,
} from '../../infrastructure/database/entities';
import {
  BUYBACK_TO_RESALE_MULTIPLIER,
  PriceTriangulationService,
} from './price-triangulation.service';

function makeDataSource(opts: {
  item: Partial<ItemEntity> | null;
  attributes: Partial<ItemAttributeEntity>[];
  cachedRows?: Partial<ItemPriceResearchEntity>[];
}) {
  const insert = jest.fn().mockResolvedValue(undefined);
  const findOneBy = jest.fn().mockResolvedValue(opts.item);
  // Disambiguiert nach Entity, weil readFreshCache() (ItemPriceResearchEntity)
  // UND die Attribut-Auflösung (ItemAttributeEntity) beide `manager.find`
  // nutzen — ein einzelner geteilter Mock-Rückgabewert würde eines der
  // beiden Ergebnisse fälschlich für das andere halten.
  const find = jest.fn().mockImplementation((entity: unknown) => {
    if (entity === ItemPriceResearchEntity) return Promise.resolve(opts.cachedRows ?? []);
    return Promise.resolve(opts.attributes);
  });
  const dataSource = { manager: { findOneBy, find, insert } } as unknown as DataSource;
  return { dataSource, insert, findOneBy, find };
}

function attr(key: string, value: string | null): Partial<ItemAttributeEntity> {
  return { attributeKey: key, attributeValue: value };
}

describe('PriceTriangulationService', () => {
  let marketProvider: jest.Mocked<MarketDistributionProvider>;
  let groundingProvider: jest.Mocked<MarketDistributionProvider>;
  let buybackProvider: jest.Mocked<BuybackAnchorProvider>;

  beforeEach(() => {
    marketProvider = { search: jest.fn() };
    groundingProvider = { search: jest.fn().mockResolvedValue(null) };
    buybackProvider = { quote: jest.fn() };
  });

  const makeService = (dataSource: DataSource) =>
    new PriceTriangulationService(dataSource, marketProvider, groundingProvider, buybackProvider);

  it('throws NotFoundException when the item does not exist', async () => {
    const { dataSource } = makeDataSource({ item: null, attributes: [] });
    const service = makeService(dataSource);

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

    const service = makeService(dataSource);
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

  it('adds Gemini grounding as its own separately-labeled third source', async () => {
    const { dataSource } = makeDataSource({
      item: { id: 'i1', condition: 'good' },
      attributes: [attr('brand', 'Nike'), attr('category', 'Sneaker')],
    });
    marketProvider.search.mockResolvedValue(null);
    groundingProvider.search.mockResolvedValue({
      median: 36,
      p25: 30,
      p75: 44,
      sampleSize: 7,
      currency: 'EUR',
      providerLabel: 'Gemini + Google Search Grounding',
      comparableListings: [],
    });
    buybackProvider.quote.mockResolvedValue(null);

    const service = makeService(dataSource);
    const result = await service.research('i1');

    expect(result.sources.map((s) => s.source)).toEqual(['GEMINI_GROUNDING']);
    expect(result.sources[0].median).toBe(36);
    expect(groundingProvider.search).toHaveBeenCalledWith({ keywords: 'Nike Sneaker', condition: 'good' });
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

    const service = makeService(dataSource);
    const result = await service.research('i1');

    expect(result.sources).toHaveLength(0);
  });

  it('skips the market lookup entirely when no brand/category attribute is known', async () => {
    const { dataSource } = makeDataSource({
      item: { id: 'i1', condition: 'good' },
      attributes: [],
    });
    buybackProvider.quote.mockResolvedValue(null);

    const service = makeService(dataSource);
    const result = await service.research('i1');

    expect(marketProvider.search).not.toHaveBeenCalled();
    expect(groundingProvider.search).not.toHaveBeenCalled();
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

    const service = makeService(dataSource);
    const result = await service.research('i1');

    expect(result.sources.map((s) => s.source)).toEqual(['EBAY_ACTIVE_LISTINGS']);
  });

  it('returns a fresh cached batch instead of calling the providers again (bug fix: was never read back)', async () => {
    const fetchedAt = new Date(Date.now() - 60 * 1000); // 1 Minute alt
    const { dataSource } = makeDataSource({
      item: { id: 'i1', condition: 'good' },
      attributes: [attr('brand', 'Nike'), attr('category', 'Sneaker')],
      cachedRows: [
        {
          source: 'EBAY_ACTIVE_LISTINGS',
          providerLabel: 'eBay Browse API (Mock)',
          median: 34,
          p25: 28,
          p75: 41,
          sampleSize: 12,
          currency: 'EUR',
          rawResponse: null,
          fetchedAt,
        },
      ],
    });

    const service = makeService(dataSource);
    const result = await service.research('i1');

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].median).toBe(34);
    expect(result.fetchedAt).toBe(fetchedAt);
    expect(marketProvider.search).not.toHaveBeenCalled();
    expect(groundingProvider.search).not.toHaveBeenCalled();
    expect(buybackProvider.quote).not.toHaveBeenCalled();
  });

  it('ignores a stale cached batch older than the TTL and researches live instead', async () => {
    const staleFetchedAt = new Date(Date.now() - 7 * 60 * 60 * 1000); // 7h alt (TTL: 6h)
    const { dataSource } = makeDataSource({
      item: { id: 'i1', condition: 'good' },
      attributes: [attr('brand', 'Nike'), attr('category', 'Sneaker')],
      cachedRows: [
        {
          source: 'EBAY_ACTIVE_LISTINGS',
          providerLabel: 'eBay Browse API (Mock)',
          median: 34,
          p25: 28,
          p75: 41,
          sampleSize: 12,
          currency: 'EUR',
          rawResponse: null,
          fetchedAt: staleFetchedAt,
        },
      ],
    });
    marketProvider.search.mockResolvedValue({
      median: 40,
      p25: 35,
      p75: 45,
      sampleSize: 8,
      currency: 'EUR',
      providerLabel: 'eBay Browse API (Mock)',
      comparableListings: [],
    });
    buybackProvider.quote.mockResolvedValue(null);

    const service = makeService(dataSource);
    const result = await service.research('i1');

    expect(marketProvider.search).toHaveBeenCalled();
    expect(result.sources[0].median).toBe(40);
  });

  it('bypasses a fresh cache when forceRefresh is set', async () => {
    const fetchedAt = new Date(Date.now() - 60 * 1000);
    const { dataSource } = makeDataSource({
      item: { id: 'i1', condition: 'good' },
      attributes: [attr('brand', 'Nike'), attr('category', 'Sneaker')],
      cachedRows: [
        {
          source: 'EBAY_ACTIVE_LISTINGS',
          providerLabel: 'eBay Browse API (Mock)',
          median: 34,
          p25: 28,
          p75: 41,
          sampleSize: 12,
          currency: 'EUR',
          rawResponse: null,
          fetchedAt,
        },
      ],
    });
    marketProvider.search.mockResolvedValue({
      median: 40,
      p25: 35,
      p75: 45,
      sampleSize: 8,
      currency: 'EUR',
      providerLabel: 'eBay Browse API (Mock)',
      comparableListings: [],
    });
    buybackProvider.quote.mockResolvedValue(null);

    const service = makeService(dataSource);
    const result = await service.research('i1', { forceRefresh: true });

    expect(marketProvider.search).toHaveBeenCalled();
    expect(result.sources[0].median).toBe(40);
  });

  it('never persists rows when no source produced a result', async () => {
    const { dataSource, insert } = makeDataSource({
      item: { id: 'i1', condition: 'good' },
      attributes: [],
    });
    buybackProvider.quote.mockResolvedValue(null);

    const service = makeService(dataSource);
    await service.research('i1');

    expect(insert).not.toHaveBeenCalled();
  });
});
