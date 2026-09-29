export type DealScore = 'SEHR_GUT' | 'GUT' | 'FAIR' | 'TEUER';

export type AnkaufPlatform = 'KLEINANZEIGEN' | 'EBAY' | 'VINTED' | 'FACEBOOK' | 'SONSTIGE';

export interface AnkaufListing {
  title: string;
  price: number;
  platform: AnkaufPlatform;
  url: string | null;
  condition: string | null;
  dealScore: DealScore | null;
  priceVsMarketPct: number | null;
}

export interface ConditionPriceImpact {
  factor: number;
  label: string;
}

export interface AnkaufResearchResult {
  keywords: string;
  location: string;
  marketMedianEur: number | null;
  listings: AnkaufListing[];
  conditionPriceImpact: Record<string, ConditionPriceImpact>;
  searchedAt: string;
}

export interface AnkaufSearchRequest {
  keywords: string;
}
