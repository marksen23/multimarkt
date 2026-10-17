import type { AnkaufConditionKey } from './condition';

export type DealScore = 'SEHR_GUT' | 'GUT' | 'FAIR' | 'TEUER';

export type AnkaufPlatform = 'KLEINANZEIGEN' | 'EBAY' | 'VINTED' | 'FACEBOOK' | 'SONSTIGE';

export interface AnkaufListing {
  title: string;
  price: number;
  platform: AnkaufPlatform;
  url: string | null;
  // Zustandsangabe der Quelle, wörtlich. null, wenn die Quelle keine nennt.
  condition: string | null;
  // Aus `condition` gelesen, nie aus dem Titel.
  conditionKey: AnkaufConditionKey | null;
  conditionUncertain: boolean;
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

export interface AnkaufSearchProfile {
  postalCode: string | null;
  radiusKm: number;
}

export interface AnkaufSearchSummary {
  id: string;
  keywords: string;
  postalCode: string;
  radiusKm: number;
  location: string;
  marketMedianEur: number | null;
  listingCount: number;
  searchedAt: string;
}
