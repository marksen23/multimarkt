import { Inject, Injectable } from '@nestjs/common';
import {
  ANKAUF_SEARCH_PROVIDER,
  AnkaufSearchProvider,
} from '../../domain/ankauf/ankauf-search-provider.interface';
import {
  MARKET_DISTRIBUTION_PROVIDER,
  MarketDistributionProvider,
} from '../../domain/pricing/market-distribution-provider.interface';
import type {
  AnkaufListing,
  AnkaufResearchResult,
  ConditionPriceImpact,
  DealScore,
} from '../../domain/ankauf/ankauf.types';

const LOCATION = 'Berlin';

// Documented approximations — not guarantees
const CONDITION_IMPACT: Record<string, ConditionPriceImpact> = {
  wie_neu: { factor: 1.15, label: '+15 % gegenüber „gut erhalten"' },
  gut: { factor: 1.0, label: 'Referenzpreis' },
  gebraucht: { factor: 0.80, label: '−20 % gegenüber „gut erhalten"' },
  defekt: { factor: 0.45, label: '−55 % gegenüber „gut erhalten"' },
};

const SCORE_THRESHOLDS = { SEHR_GUT: 0.70, GUT: 0.85, FAIR: 1.05 } as const;
const CACHE_TTL_MS = 30 * 60 * 1000;

function computeDealScore(price: number, marketMedian: number): DealScore {
  const ratio = price / marketMedian;
  if (ratio <= SCORE_THRESHOLDS.SEHR_GUT) return 'SEHR_GUT';
  if (ratio <= SCORE_THRESHOLDS.GUT) return 'GUT';
  if (ratio <= SCORE_THRESHOLDS.FAIR) return 'FAIR';
  return 'TEUER';
}

const DEAL_SCORE_ORDER: DealScore[] = ['SEHR_GUT', 'GUT', 'FAIR', 'TEUER'];

interface CacheEntry {
  result: AnkaufResearchResult;
  expiresAt: number;
}

@Injectable()
export class AnkaufResearchService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @Inject(ANKAUF_SEARCH_PROVIDER) private readonly provider: AnkaufSearchProvider,
    @Inject(MARKET_DISTRIBUTION_PROVIDER) private readonly ebayProvider: MarketDistributionProvider,
  ) {}

  async search(keywords: string): Promise<AnkaufResearchResult> {
    const cacheKey = keywords.trim().toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) return cached.result;

    const [raw, ebayResult] = await Promise.all([
      this.provider.search({ keywords, location: LOCATION }),
      this.ebayProvider.search({ keywords, condition: null }),
    ]);

    const marketMedian = raw?.marketMedian ?? ebayResult?.median ?? null;
    const rawListings = raw?.listings ?? [];

    // Merge eBay comparableListings as additional EBAY-platform listings, dedup by title
    const seenTitles = new Set(rawListings.map((l) => l.title.toLowerCase().trim()));
    const ebayListings = (ebayResult?.comparableListings ?? [])
      .filter((l) => l.price > 0 && !seenTitles.has(l.title.toLowerCase().trim()))
      .map((l) => ({
        title: l.title,
        price: l.price,
        platform: 'EBAY' as const,
        url: l.url ?? null,
        condition: null as string | null,
      }));

    const listings: AnkaufListing[] = [...rawListings, ...ebayListings]
      .filter((l) => l.price > 0)
      .map((l) => {
        const dealScore = marketMedian !== null ? computeDealScore(l.price, marketMedian) : null;
        const priceVsMarketPct =
          marketMedian !== null
            ? Math.round(((l.price - marketMedian) / marketMedian) * 1000) / 10
            : null;
        return { ...l, dealScore, priceVsMarketPct };
      })
      .sort((a, b) => {
        const ai = a.dealScore ? DEAL_SCORE_ORDER.indexOf(a.dealScore) : 99;
        const bi = b.dealScore ? DEAL_SCORE_ORDER.indexOf(b.dealScore) : 99;
        if (ai !== bi) return ai - bi;
        return a.price - b.price;
      });

    const result: AnkaufResearchResult = {
      keywords,
      location: LOCATION,
      marketMedianEur: marketMedian,
      listings,
      conditionPriceImpact: CONDITION_IMPACT,
      searchedAt: new Date().toISOString(),
    };

    this.cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }
}
