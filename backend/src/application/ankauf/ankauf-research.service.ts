import { Inject, Injectable } from '@nestjs/common';
import {
  ANKAUF_SEARCH_PROVIDER,
  AnkaufSearchProvider,
} from '../../domain/ankauf/ankauf-search-provider.interface';
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

function computeDealScore(price: number, marketMedian: number): DealScore {
  const ratio = price / marketMedian;
  if (ratio <= SCORE_THRESHOLDS.SEHR_GUT) return 'SEHR_GUT';
  if (ratio <= SCORE_THRESHOLDS.GUT) return 'GUT';
  if (ratio <= SCORE_THRESHOLDS.FAIR) return 'FAIR';
  return 'TEUER';
}

const DEAL_SCORE_ORDER: DealScore[] = ['SEHR_GUT', 'GUT', 'FAIR', 'TEUER'];

@Injectable()
export class AnkaufResearchService {
  constructor(@Inject(ANKAUF_SEARCH_PROVIDER) private readonly provider: AnkaufSearchProvider) {}

  async search(keywords: string): Promise<AnkaufResearchResult> {
    const raw = await this.provider.search({ keywords, location: LOCATION });

    const marketMedian = raw?.marketMedian ?? null;
    const rawListings = raw?.listings ?? [];

    const listings: AnkaufListing[] = rawListings
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

    return {
      keywords,
      location: LOCATION,
      marketMedianEur: marketMedian,
      listings,
      conditionPriceImpact: CONDITION_IMPACT,
      searchedAt: new Date().toISOString(),
    };
  }
}
