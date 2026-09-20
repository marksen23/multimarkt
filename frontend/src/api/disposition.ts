import { api } from './client';

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
}

export interface DispositionRecommendation {
  action: DispositionAction;
  recommendedPlatforms: PlatformRecommendation[];
  rationale: string;
  estimatedEffortMinutes: number;
}

export interface EvaluateDispositionInput {
  category: string;
  marketMedianPrice: number;
  isBulky?: boolean;
  userGoal: DispositionUserGoal;
}

export const dispositionApi = {
  evaluate: (itemId: string, input: EvaluateDispositionInput) =>
    api.post<DispositionRecommendation>(`/items/${itemId}/disposition`, input),
};
