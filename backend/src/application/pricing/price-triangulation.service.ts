import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BUYBACK_ANCHOR_PROVIDER,
  BuybackAnchorProvider,
} from '../../domain/pricing/buyback-anchor-provider.interface';
import {
  MARKET_DISTRIBUTION_PROVIDER,
  MarketDistributionProvider,
  MIN_MARKET_SAMPLE_SIZE,
} from '../../domain/pricing/market-distribution-provider.interface';
import { PriceResearchSource } from '../../domain/pricing/price-research-vocabulary';
import {
  ItemAttributeEntity,
  ItemEntity,
  ItemPriceResearchEntity,
} from '../../infrastructure/database/entities';

/**
 * Preis-Triangulation (docs/README.md §9e) — kombiniert eBay-Browse-
 * Verteilung und Ankaufportal-Anker zu MEHREREN, getrennt ausgewiesenen
 * Preissignalen. Vermischt Quellen bewusst NIE zu einer Blackbox-Zahl
 * (§9d Punkt 3) und schreibt nie automatisch in `canonical_listings` oder
 * `item_attributes` — reiner, jederzeit neu abrufbarer Beratungs-Cache.
 */

// §9e: grobe, noch ungelernte Anfangsschätzung. Soll über die
// Bandit-Lernschleife aus §10a nachjustiert werden, sobald eigene
// Verkaufsdaten pro Kategorie vorliegen — hier bewusst als benannte
// Konstante, nicht versteckt in einer Formel.
export const BUYBACK_TO_RESALE_MULTIPLIER = 3.0;

export interface PriceResearchSourceResult {
  source: PriceResearchSource;
  providerLabel: string;
  median: number | null;
  p25: number | null;
  p75: number | null;
  sampleSize: number;
  currency: string;
  detail?: Record<string, unknown>;
}

export interface PriceResearchResult {
  itemId: string;
  sources: PriceResearchSourceResult[];
  fetchedAt: Date;
}

@Injectable()
export class PriceTriangulationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(MARKET_DISTRIBUTION_PROVIDER)
    private readonly marketProvider: MarketDistributionProvider,
    @Inject(BUYBACK_ANCHOR_PROVIDER)
    private readonly buybackProvider: BuybackAnchorProvider,
  ) {}

  async research(itemId: string): Promise<PriceResearchResult> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id: itemId });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    const attributes = await this.dataSource.manager.find(ItemAttributeEntity, {
      where: { itemId },
    });
    const attributeValue = (key: string): string | null =>
      attributes.find((a) => a.attributeKey === key)?.attributeValue ?? null;

    const brand = attributeValue('brand');
    const category = attributeValue('category');

    const sources: PriceResearchSourceResult[] = [];

    const marketResult = await this.researchMarketDistribution(
      [brand, category].filter((v): v is string => !!v).join(' '),
      item.condition,
    );
    if (marketResult) sources.push(marketResult);

    const buybackResult = await this.researchBuybackAnchor(brand, category);
    if (buybackResult) sources.push(buybackResult);

    const fetchedAt = new Date();
    await this.persist(itemId, sources, fetchedAt);

    return { itemId, sources, fetchedAt };
  }

  private async researchMarketDistribution(
    keywords: string,
    condition: string | null,
  ): Promise<PriceResearchSourceResult | null> {
    if (!keywords.trim()) return null;

    const result = await this.marketProvider.search({ keywords, condition });
    // §9d Punkt 4: Mindest-Stichprobengröße wird hier, zentral, durchgesetzt —
    // nicht vom Provider, damit die Regel für jede künftige Quelle gleich gilt.
    if (!result || result.sampleSize < MIN_MARKET_SAMPLE_SIZE) return null;

    return {
      source: 'EBAY_ACTIVE_LISTINGS',
      providerLabel: result.providerLabel,
      median: result.median,
      p25: result.p25,
      p75: result.p75,
      sampleSize: result.sampleSize,
      currency: result.currency,
    };
  }

  private async researchBuybackAnchor(
    brand: string | null,
    category: string | null,
  ): Promise<PriceResearchSourceResult | null> {
    const quote = await this.buybackProvider.quote({ brand, category });
    if (!quote) return null;

    const impliedResaleEstimate = Math.round(quote.buybackPrice * BUYBACK_TO_RESALE_MULTIPLIER * 100) / 100;

    return {
      source: 'ANKAUF_PORTAL',
      providerLabel: quote.portalName,
      median: impliedResaleEstimate,
      p25: null,
      p75: null,
      sampleSize: 1,
      currency: quote.currency,
      detail: { buybackPrice: quote.buybackPrice, multiplier: BUYBACK_TO_RESALE_MULTIPLIER },
    };
  }

  private async persist(
    itemId: string,
    sources: PriceResearchSourceResult[],
    fetchedAt: Date,
  ): Promise<void> {
    if (sources.length === 0) return;

    await this.dataSource.manager.insert(
      ItemPriceResearchEntity,
      // TypeORMs DeepPartial-Typing kommt bei jsonb-Spalten mit `| null`
      // nicht klar (bekanntes Problem, siehe MarketplacePublishingService/
      // fallbackData) — der Payload selbst ist zur Laufzeit korrekt.
      sources.map((s) => ({
        itemId,
        source: s.source,
        median: s.median,
        p25: s.p25,
        p75: s.p75,
        sampleSize: s.sampleSize,
        currency: s.currency,
        providerLabel: s.providerLabel,
        rawResponse: s.detail ?? null,
        fetchedAt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any[],
    );
  }
}
