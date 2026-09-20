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

export interface ItemDetail {
  item: Item;
  attributes: ItemAttribute[];
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

export interface ApiError {
  error_code: string;
  message: string;
  details: Record<string, unknown>;
}
