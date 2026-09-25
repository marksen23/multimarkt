// Spiegelt das V2.2-Vokabular aus Doc 01/02 (backend/src/domain/state-vocabulary.ts).
// Bewusst hier dupliziert statt importiert — Frontend und Backend sind
// getrennte npm-Projekte ohne Shared-Package (Einzelentwickler-Setup,
// kein Monorepo-Workspace-Tooling in Schritt 1 eingerichtet).

export type ItemLifecycleState =
  | 'NEW'
  | 'ANALYZING'
  | 'REVIEW_REQUIRED'
  | 'READY'
  | 'BUNDLED'
  | 'LISTED'
  | 'SOLD'
  | 'ARCHIVED'
  | 'SALE_CONFLICT'
  | 'CANCELLED';

export type BundleLifecycleState = 'NEW' | 'READY' | 'LISTED' | 'SOLD' | 'CANCELLED';

export type ProjectionLifecycleState =
  | 'DRAFT'
  | 'READY'
  | 'PUBLISHING'
  | 'ONLINE'
  | 'CANCEL_PENDING'
  | 'CANCELLED'
  | 'SOLD';

export type TruthState = 'UNKNOWN' | 'INFERRED' | 'USER_CONFIRMED';

export interface Item {
  id: string;
  userId: string;
  status: ItemLifecycleState;
  title: string | null;
  condition: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemAttribute {
  id: string;
  itemId: string;
  attributeKey: string;
  attributeValue: string | null;
  truthState: TruthState;
  source: string;
  createdAt: string;
}

export interface MarketplaceProjectionSummary {
  id: string;
  marketplaceId: string;
  status: ProjectionLifecycleState;
  externalPlatformId: string | null;
}

export interface ListingSummary {
  id: string;
  sellingPrice: number;
  descriptionText: string;
  projections: MarketplaceProjectionSummary[];
}

export interface ItemPhoto {
  id: string;
  itemId: string;
  url: string;
  createdAt: string;
}

export interface ItemDetail {
  item: Item;
  attributes: ItemAttribute[];
  listings: ListingSummary[];
  photos: ItemPhoto[];
}

export interface ItemListEntry {
  item: Item;
  listings: ListingSummary[];
  thumbnailUrl: string | null;
}

export interface Bundle {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: BundleLifecycleState;
  createdAt: string;
}

export interface BundleListEntry {
  bundle: Bundle;
  listings: ListingSummary[];
}

export interface BundleDetail {
  bundle: Bundle;
  items: Item[];
  listings: ListingSummary[];
}

export interface CanonicalListing {
  id: string;
  userId: string;
  itemId: string | null;
  bundleId: string | null;
  sellingPrice: number;
  descriptionText: string;
  createdAt: string;
}

export interface SaleEvent {
  id: string;
  projectionId: string;
  externalEventId: string;
  reportedPrice: number;
  isWinner: boolean | null;
  cancellationConfirmed: boolean;
  reportedAt: string;
  createdAt: string;
}

export interface DeletionAuditLog {
  id: string;
  anonymizedUserHash: string;
  mediaHardDeleted: boolean;
  dbRecordsDeleted: boolean;
  deletionCompletedAt: string;
}

export type PriceResearchSource = 'EBAY_ACTIVE_LISTINGS' | 'ANKAUF_PORTAL' | 'GEMINI_GROUNDING';

export interface ComparableListing {
  title: string;
  price: number;
}

export interface PriceResearchSourceResult {
  source: PriceResearchSource;
  providerLabel: string;
  median: number | null;
  p25: number | null;
  p75: number | null;
  sampleSize: number;
  currency: string;
  detail?: { comparableListings?: ComparableListing[]; buybackPrice?: number; multiplier?: number };
}

export interface PriceResearchResult {
  itemId: string;
  sources: PriceResearchSourceResult[];
  fetchedAt: string;
}

export type ListingChannel = 'KLEINANZEIGEN' | 'EBAY' | 'VINTED';

export interface TitleGapAnalysis {
  ownTokens: string[];
  missingTokens: string[];
}

export interface TitleSuggestion {
  title: string;
  gapAnalysis: TitleGapAnalysis;
}

export type PhotoQualityIssueType = 'BLURRY' | 'TOO_DARK' | 'TOO_BRIGHT' | 'LOW_RESOLUTION' | 'DUPLICATE';

export interface PhotoQualityIssue {
  photoIndex: number;
  type: PhotoQualityIssueType;
  message: string;
}

export interface PhotoQualityReport {
  photoCount: number;
  issues: PhotoQualityIssue[];
}

export interface ApiError {
  error_code: string;
  message: string;
  details: Record<string, unknown>;
}
