import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
} from '../../domain/pricing/market-distribution-provider.interface';
import { buildMarketKeywords } from '../../domain/pricing/market-keywords';
import {
  MarketQueryLevel,
  MarketQueryStep,
  buildMarketQueryLadder,
  marketProductLabel,
} from '../../domain/pricing/market-query-ladder';
import { marketSearchMessage } from '../../domain/pricing/market-search-error';
import { PriceResearchSource } from '../../domain/pricing/price-research-vocabulary';
import { PriceRecommendation } from '../../domain/pricing/price-recommendation';
import { MIN_MARKET_SAMPLE_SIZE } from '../../domain/pricing/market-distribution-provider.interface';
import { marketplaceSearchLinks, type MarketplaceSearchLink } from '../../domain/search/marketplace-search-links';
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
  /** Suchbegriff, mit dem die Quellen gefragt wurden. Leer, wenn nichts Identifizierendes da ist. */
  query: string;
  /** Wie eng die verwendete Suche war. Null, wenn gar nicht gesucht wurde. */
  queryLevel: MarketQueryLevel | null;
  /** Direkte Plattformsuchen. Kein Abruf der Seiten. */
  searchLinks: MarketplaceSearchLink[];
  /** Warum es keinen belastbaren Vorschlag gibt, sonst null. */
  notice: string | null;
}

@Injectable()
export class PriceTriangulationService {
  private readonly logger = new Logger(PriceTriangulationService.name);

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

    const attributes = await this.dataSource.manager.find(ItemAttributeEntity, {
      where: { itemId },
    });
    const attributeValue = (key: string): string | null =>
      attributes.find((a) => a.attributeKey === key)?.attributeValue ?? null;
    const keywordInput = {
      title: item.title,
      brand: attributeValue('brand'),
      model: attributeValue('model'),
      category: attributeValue('category'),
      categoryDetail: attributeValue('categoryDetail'),
      color: attributeValue('color'),
      searchTerms: attributeValue('searchTerms'),
      specs: attributes
        .filter((attribute) => attribute.attributeKey.startsWith('spec:') && attribute.attributeValue)
        .map((attribute) => ({ key: attribute.attributeKey, value: attribute.attributeValue })),
    };
    const keywords = buildMarketKeywords(keywordInput);
    const ladder = buildMarketQueryLadder(keywordInput);
    const condition = item.condition?.trim() || attributeValue('condition');
    const place = /^\d{5}$/.test(item.postalCode?.trim() ?? '')
      ? { postalCode: item.postalCode!.trim(), radiusKm: 20 }
      : null;

    if (!options.forceRefresh) {
      const cached = await this.readFreshCache(itemId);
      if (cached) {
        return this.withAdvice(cached, options.salesGoal ?? null, {
          keywords,
          ladder,
          condition,
          place,
          ebayNotice: null,
        });
      }
    }

    const brand = attributeValue('brand');
    const category = attributeValue('category');
    const identity = {
      brand,
      model: attributeValue('model'),
      product: marketProductLabel(keywordInput),
    };

    const sources: PriceResearchSourceResult[] = [];
    const ebay = await this.searchEbayLadder(ladder, condition, identity, place?.postalCode ?? null);
    if (ebay.source) sources.push(ebay.source);

    // Eine Websuche, mit dem Begriff, den eBay behalten hat. Kein zweiter
    // kostenpflichtiger Lauf über die ganze Leiter.
    const groundingKeywords = ebay.step?.keywords ?? ladder[0]?.keywords ?? '';
    const groundingResult = await this.researchMarketDistribution(
      this.groundingProvider,
      'GEMINI_GROUNDING',
      groundingKeywords,
      condition,
      identity,
      ebay.step?.level === 'specific',
      ebay.step?.level !== 'broad',
    );
    if (groundingResult) sources.push(groundingResult);

    const buybackResult = await this.researchBuybackAnchor(brand, category);
    if (buybackResult) sources.push(buybackResult);

    const fetchedAt = new Date();
    await this.persist(itemId, sources, fetchedAt);

    return this.withAdvice(
      { itemId, sources, fetchedAt },
      options.salesGoal ?? null,
      { keywords, ladder, condition, place, ebayNotice: ebay.notice, chosen: ebay.step },
    );
  }

  private withAdvice(
    base: Omit<PriceResearchResult, 'recommendation' | 'query' | 'queryLevel' | 'searchLinks' | 'notice'>,
    salesGoal: SalesGoal | null,
    advice: {
      keywords: string;
      ladder: MarketQueryStep[];
      condition: string | null;
      place: { postalCode: string; radiusKm: number } | null;
      ebayNotice: string | null;
      chosen?: MarketQueryStep | null;
    },
  ): PriceResearchResult {
    const stored = storedQuery(base.sources);
    const chosen = advice.chosen ?? stored;
    const query = chosen?.keywords || advice.keywords;
    const queryLevel = chosen?.level ?? (query ? advice.ladder[0]?.level ?? 'specific' : null);
    const recommendation = this.recommendationService.recommend(base.sources, salesGoal, {
      condition: advice.condition,
      query: query || null,
      queryLevel,
    });
    const liveMarket = base.sources.some(
      (source) =>
        (source.source === 'EBAY_ACTIVE_LISTINGS' || source.source === 'GEMINI_GROUNDING') &&
        source.detail?.illustrative !== true &&
        !/\(Mock\)/i.test(source.providerLabel),
    );
    let notice: string | null = null;
    if (!query) {
      notice = 'Für einen Preisvergleich fehlen Marke, Artikelart oder Titel.';
    } else if (advice.ebayNotice) {
      notice = advice.ebayNotice;
    } else if (!liveMarket) {
      notice =
        'Keine passenden aktiven Angebote auf eBay.de. Die Links öffnen dieselbe Suche. Preise werden nicht erfunden.';
    }
    return {
      ...base,
      recommendation,
      query,
      queryLevel,
      searchLinks: marketplaceSearchLinks(query, advice.place),
      notice,
    };
  }

  private async searchEbayLadder(
    ladder: MarketQueryStep[],
    condition: string | null,
    identity: { brand: string | null; model: string | null; product: string | null },
    postalCode: string | null,
  ): Promise<{ source: PriceResearchSourceResult | null; step: MarketQueryStep | null; notice: string | null }> {
    let best: { source: PriceResearchSourceResult; step: MarketQueryStep } | null = null;
    let notice: string | null = null;

    for (const step of ladder) {
      try {
        const source = await this.researchMarketDistribution(
          this.marketProvider,
          'EBAY_ACTIVE_LISTINGS',
          step.keywords,
          condition,
          identity,
          step.level === 'specific',
          step.level !== 'broad',
          postalCode,
          step,
        );
        if (!source) continue;
        if (!best || source.sampleSize > best.source.sampleSize) best = { source, step };
        if (source.sampleSize >= MIN_MARKET_SAMPLE_SIZE) break;
      } catch (error) {
        notice = marketSearchMessage(error);
        this.logger.warn(`EBAY_ACTIVE_LISTINGS search failed: ${notice}`);
        break;
      }
    }

    return { source: best?.source ?? null, step: best?.step ?? null, notice };
  }

  private async researchMarketDistribution(
    provider: MarketDistributionProvider,
    source: PriceResearchSource,
    keywords: string,
    condition: string | null,
    identity: { brand: string | null; model: string | null; product: string | null },
    requireModel: boolean,
    requireBrand: boolean,
    postalCode: string | null = null,
    step: MarketQueryStep | null = null,
  ): Promise<PriceResearchSourceResult | null> {
    if (!keywords.trim()) return null;

    let result: Awaited<ReturnType<MarketDistributionProvider['search']>>;
    try {
      result = await provider.search({
        keywords,
        condition,
        brand: identity.brand,
        model: identity.model,
        product: identity.product,
        postalCode,
        requireModel,
        requireBrand,
      });
    } catch (error) {
      if (source === 'EBAY_ACTIVE_LISTINGS') throw error;
      this.logger.warn(`${source} search failed: ${(error as Error).message}`);
      return null;
    }
    // Feature 2.7: auch unter fünf Vergleichen bleibt die Quelle sichtbar,
    // damit die Spanne gezeigt werden kann. Der konkrete Startpreis wird
    // erst in PriceRecommendationService zurückgehalten.
    if (!result || result.sampleSize < 1) return null;

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
      detail: {
        comparableListings: result.comparableListings,
        query: step?.keywords ?? keywords,
        queryLevel: step?.level,
        ...(result.excludedCount ? { excludedCount: result.excludedCount } : {}),
        ...(result.filterNote ? { filterNote: result.filterNote } : {}),
        ...(result.priceKind ? { priceKind: result.priceKind } : {}),
        ...(result.marketplace ? { marketplace: result.marketplace } : {}),
        ...(result.illustrative || /\(Mock\)/i.test(result.providerLabel) ? { illustrative: true } : {}),
      },
    };
  }

  private async researchBuybackAnchor(
    brand: string | null,
    category: string | null,
  ): Promise<PriceResearchSourceResult | null> {
    const quote = await this.buybackProvider.quote({ brand, category });
    if (!quote) return null;

    const impliedResaleEstimate = Math.round(quote.buybackPrice * BUYBACK_TO_RESALE_MULTIPLIER * 100) / 100;

    const illustrative = quote.illustrative === true || /\(Mock\)/i.test(quote.portalName);

    return {
      source: 'ANKAUF_PORTAL',
      providerLabel: quote.portalName,
      median: impliedResaleEstimate,
      p25: null,
      p75: null,
      sampleSize: 1,
      currency: quote.currency,
      detail: {
        buybackPrice: quote.buybackPrice,
        multiplier: BUYBACK_TO_RESALE_MULTIPLIER,
        illustrative,
      },
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
  ): Promise<Omit<PriceResearchResult, 'recommendation' | 'query' | 'queryLevel' | 'searchLinks' | 'notice'> | null> {
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

function storedQuery(sources: PriceResearchSourceResult[]): MarketQueryStep | null {
  const ebay = sources.find((source) => source.source === 'EBAY_ACTIVE_LISTINGS');
  const query = ebay?.detail?.query;
  if (typeof query !== 'string' || !query.trim()) return null;
  const level = ebay?.detail?.queryLevel;
  if (level === 'specific' || level === 'broader' || level === 'broad') {
    return { keywords: query, level };
  }
  return { keywords: query, level: 'specific' };
}
