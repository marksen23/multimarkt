export interface EbayCategorySuggestion {
  categoryId: string;
  categoryName: string;
}

export interface EbayAspectDefinition {
  name: string;
  required: boolean;
}

export interface EbaySellTransport {
  suggestCategory(query: string): Promise<EbayCategorySuggestion | null>;
  aspectsForCategory(categoryId: string): Promise<EbayAspectDefinition[]>;
  putInventoryItem(sku: string, body: unknown): Promise<void>;
  createOffer(body: unknown): Promise<{ offerId: string }>;
  publishOffer(offerId: string): Promise<{ listingId: string }>;
  withdrawOffer(offerId: string): Promise<void>;
}

export interface EbayPublishMeta {
  sku: string;
  offerId: string;
  listingId: string;
  categoryId: string;
  categoryName: string;
  conditionId: string;
  fulfillmentPolicyId: string;
}
