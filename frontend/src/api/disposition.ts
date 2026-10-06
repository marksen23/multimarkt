import { api } from './client';
import type { ExpectedMargin } from '../margin/expected-margin';

export type DispositionUserGoal = 'MAX_PROFIT' | 'BALANCED' | 'FAST_SALE' | 'MINIMAL_EFFORT';
export type DispositionAction =
  | 'SELL_ONLINE'
  | 'LOCAL_PICKUP_ONLY'
  | 'DONATE'
  | 'DISCARD'
  | 'BUYBACK_SERVICE';

export interface PlatformRecommendation {
  key: string;
  netExpectedValue: number;
  reasoning: string;
  feePercent: number | null;
  feeFixedEur: number | null;
  shippingEur: number;
}

export interface DispositionRecommendation {
  action: DispositionAction;
  recommendedPlatforms: PlatformRecommendation[];
  rationale: string;
  estimatedEffortMinutes: number;
  shippingCostEur: number;
  margin: ExpectedMargin;
  individualSaleNotice: string | null;
}

export interface EvaluateDispositionInput {
  category: string;
  marketMedianPrice: number;
  userGoal: DispositionUserGoal;
}

export const dispositionApi = {
  evaluate: (itemId: string, input: EvaluateDispositionInput) =>
    api.post<DispositionRecommendation>(`/items/${itemId}/disposition`, input),
};
