import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SalesGoal } from '../../domain/ai/description-generation-provider.interface';
import {
  BUYBACK_ANCHOR_PROVIDER,
  BuybackAnchorProvider,
} from '../../domain/pricing/buyback-anchor-provider.interface';
import {
  GEMINI_GROUNDING_PROVIDER,
  MARKET_DISTRIBUTION_PROVIDER,
  MarketDistributionProvider,
  MIN_MARKET_SAMPLE_SIZE,
} from '../../domain/pricing/market-distribution-provider.interface';
import { PriceResearchSource } from '../../domain/pricing/price-research-vocabulary';
import { PriceRecommendation } from '../../domain/pricing/price-recommendation';
import {
  ItemAttributeEntity,
  ItemEntity,
  ItemPriceResearchEntity,
} from '../../infrastructure/database/entities';
import { PriceRecommendationService } from './price-recommendation.service';

/**
 * Preis-Triangulation (docs/README.md §9e) — kombiniert eBay-Browse-
 * Verteilung, Gemini+Google-Search-Grounding und Ankaufportal-Anker zu
 * MEHREREN, getrennt ausgewiesenen Preissignalen. Vermischt Quellen
 * bewusst NIE zu einer Blackbox-Zahl (§9d Punkt 3) und schreibt nie
 * automatisch in `canonical_listings` oder `item_attributes` — reiner
 * Beratungs-Cache. Innerhalb von `PRICE_RESEARCH_CACHE_TTL_MS` liest
 * `research()` die zuletzt gespeicherte Recherche zurück, statt Provider
 * (teils kostenpflichtig) erneut abzufragen — siehe `readFreshCache()`.
 */

// §9e: grobe, noch ungelernte Anfangsschätzung. Soll über die
// Bandit-Lernschleife aus §10a nachjustiert werden, sobald eigene
// Verkaufsdaten pro Kategorie vorliegen — hier bewusst als benannte
// Konstante, nicht versteckt in einer Formel.
export const BUYBACK_TO_RESALE_MULTIPLIER = 3.0;

// Bug-Fix (September 2026): `item_price_research` wurde bislang bei JEDEM
// Aufruf neu beschrieben, aber nie zurückgelesen — jeder Seitenaufruf löste
// erneute, teils kostenpflichtige API-Calls (eBay, Gemini-Grounding) aus,
// obwohl sich Marktpreise nicht sekündlich ändern. Innerhalb dieses Fensters
// wird die zuletzt gespeicherte Recherche wiederverwendet, außer der
// Aufrufer verlangt explizit `forceRefresh`.
export const PRICE_RESEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

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
  /**
   * §9e-Erweiterung: abgeleiteter Preisvorschlag (P_list/P_target/P_min) —
   * `null`, wenn keine Markt-Verteilungsquelle Daten geliefert hat (siehe
   * PriceRecommendationService). Wird bei JEDEM Aufruf frisch aus den
   * (ggf. gecachten) `sources` berechnet, hängt also vom aktuell
   * übergebenen `salesGoal` ab, auch wenn die Rohdaten aus dem Cache kommen.
   */
  recommendation: PriceRecommendation | null;
}

@Injectable()
export class PriceTriangulationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(MARKET_DISTRIBUTION_PROVIDER)
    private readonly marketProvider: MarketDistributionProvider,
    @Inject(GEMINI_GROUNDING_PROVIDER)
    private readonly groundingProvider: MarketDistributionProvider,
    @Inject(BUYBACK_ANCHOR_PROVIDER)
    private readonly buybackProvider: BuybackAnchorProvider,
    private readonly recommendationService: PriceRecommendationService,
  ) {}

  async research(
    itemId: string,
    options: { forceRefresh?: boolean; salesGoal?: SalesGoal | null } = {},
  ): Promise<PriceResearchResult> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id: itemId });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    if (!options.forceRefresh) {
      const cached = await this.readFreshCache(itemId);
      if (cached) {
        return { ...cached, recommendation: this.recommendationService.recommend(cached.sources, options.salesGoal ?? null) };
      }
    }

    const attributes = await this.dataSource.manager.find(ItemAttributeEntity, {
      where: { itemId },
    });
    const attributeValue = (key: string): string | null =>
      attributes.find((a) => a.attributeKey === key)?.attributeValue ?? null;

    const brand = attributeValue('brand');
    const category = attributeValue('category');

    const sources: PriceResearchSourceResult[] = [];
    const keywords = [brand, category].filter((v): v is string => !!v).join(' ');

    const marketResult = await this.researchMarketDistribution(
      this.marketProvider,
      'EBAY_ACTIVE_LISTINGS',
      keywords,
      item.condition,
    );
    if (marketResult) sources.push(marketResult);

    // §9e: zusätzliche, getrennt ausgewiesene Quelle — nie mit der
    // eBay-Verteilung vermischt, dieselbe Mindest-Stichprobengröße gilt.
    const groundingResult = await this.researchMarketDistribution(
      this.groundingProvider,
      'GEMINI_GROUNDING',
      keywords,
      item.condition,
    );
    if (groundingResult) sources.push(groundingResult);

    const buybackResult = await this.researchBuybackAnchor(brand, category);
    if (buybackResult) sources.push(buybackResult);

    const fetchedAt = new Date();
    await this.persist(itemId, sources, fetchedAt);

    return {
      itemId,
      sources,
      fetchedAt,
      recommendation: this.recommendationService.recommend(sources, options.salesGoal ?? null),
    };
  }

  private async researchMarketDistribution(
    provider: MarketDistributionProvider,
    source: PriceResearchSource,
    keywords: string,
    condition: string | null,
  ): Promise<PriceResearchSourceResult | null> {
    if (!keywords.trim()) return null;

    const result = await provider.search({ keywords, condition });
    // §9d Punkt 4: Mindest-Stichprobengröße wird hier, zentral, durchgesetzt —
    // nicht vom Provider, damit die Regel für jede Quelle gleich gilt.
    if (!result || result.sampleSize < MIN_MARKET_SAMPLE_SIZE) return null;

    return {
      source,
      providerLabel: result.providerLabel,
      median: result.median,
      p25: result.p25,
      p75: result.p75,
      sampleSize: result.sampleSize,
      currency: result.currency,
      // §9e-Ergänzung (September 2026): dient auch dem Titel-/
      // Beschreibungsvergleich, nicht nur der Preisrecherche.
      detail: { comparableListings: result.comparableListings },
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

  /**
   * Liest die zuletzt gespeicherte Recherche zurück, wenn sie innerhalb von
   * `PRICE_RESEARCH_CACHE_TTL_MS` liegt — `persist()` schreibt alle Quellen
   * EINES `research()`-Aufrufs mit demselben `fetchedAt`-Wert, das dient
   * hier als Batch-Schlüssel, um genau diesen einen Aufruf wieder
   * zusammenzusetzen (nicht einzelne Quellen aus verschiedenen, älteren
   * Batches vermischen).
   */
  private async readFreshCache(
    itemId: string,
  ): Promise<Omit<PriceResearchResult, 'recommendation'> | null> {
    const rows = await this.dataSource.manager.find(ItemPriceResearchEntity, {
      where: { itemId },
      order: { fetchedAt: 'DESC' },
    });
    if (rows.length === 0) return null;

    const newest = rows[0].fetchedAt;
    if (Date.now() - newest.getTime() > PRICE_RESEARCH_CACHE_TTL_MS) return null;

    const latestBatch = rows.filter((r) => r.fetchedAt.getTime() === newest.getTime());

    return {
      itemId,
      fetchedAt: newest,
      sources: latestBatch.map((r) => ({
        source: r.source,
        providerLabel: r.providerLabel,
        median: r.median,
        p25: r.p25,
        p75: r.p75,
        sampleSize: r.sampleSize,
        currency: r.currency,
        detail: r.rawResponse ?? undefined,
      })),
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
