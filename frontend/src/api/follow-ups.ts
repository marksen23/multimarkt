import { api } from "./client";

export type SuggestionBasis = "P_TARGET" | "ONE_STEP_BELOW";
export type SuggestionAnchor = "P_TARGET" | "CURRENT";

export interface PriceChangeNote {
  id: string;
  listingId: string;
  previousPrice: number;
  newPrice: number;
  note: string;
  followUpDays: number;
  changedAt: string;
}

export interface FollowUpCard {
  itemId: string;
  title: string | null;
  listingId: string;
  marketplaceId: string;
  onlineSince: string;
  daysOnline: number;
  stage: 7 | 14;
  currentPrice: number;
  suggestedPrice: number;
  suggestionBasis: SuggestionBasis;
  suggestionAnchor: SuggestionAnchor;
  targetPrice: number | null;
  headline: string;
  suggestionLabel: string;
  copyText: string;
}

export interface ItemFollowUp {
  followUp: FollowUpCard | null;
  priceChanges: PriceChangeNote[];
}

export interface PriceDropResult {
  listingId: string;
  previousPrice: number;
  sellingPrice: number;
  note: string;
  descriptionText: string;
  followUp: FollowUpCard | null;
  priceChanges: PriceChangeNote[];
}

export const followUpsApi = {
  list: () => api.get<FollowUpCard[]>("/follow-ups"),
  forItem: (itemId: string) =>
    api.get<ItemFollowUp>(`/items/${itemId}/follow-up`),
  record: (
    itemId: string,
    body: { newPrice: number; canonicalListingId: string },
  ) => api.post<PriceDropResult>(`/items/${itemId}/price-drop`, body),
};
