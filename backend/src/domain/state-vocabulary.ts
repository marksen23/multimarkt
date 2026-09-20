/**
 * Zustandsvokabular aus Doc 02 (State Machine Specification), §2.
 * Einzige Quelle der Wahrheit für die erlaubten Werte der Postgres-Enums
 * `item_lifecycle_state`, `bundle_lifecycle_state`, `truth_state` und
 * `projection_lifecycle_state` (siehe migrations/*-InitialSchema.ts).
 */

export const ITEM_LIFECYCLE_STATES = [
  'NEW',
  'ANALYZING',
  'REVIEW_REQUIRED',
  'READY',
  'BUNDLED',
  'LISTED',
  'SOLD',
  'ARCHIVED',
  'SALE_CONFLICT',
  'CANCELLED',
] as const;
export type ItemLifecycleState = (typeof ITEM_LIFECYCLE_STATES)[number];

export const BUNDLE_LIFECYCLE_STATES = [
  'NEW',
  'READY',
  'LISTED',
  'SOLD',
  'CANCELLED',
] as const;
export type BundleLifecycleState = (typeof BUNDLE_LIFECYCLE_STATES)[number];

export const TRUTH_STATES = ['UNKNOWN', 'INFERRED', 'USER_CONFIRMED'] as const;
export type TruthState = (typeof TRUTH_STATES)[number];

export const PROJECTION_LIFECYCLE_STATES = [
  'DRAFT',
  'READY',
  'PUBLISHING',
  'ONLINE',
  'CANCEL_PENDING',
  'CANCELLED',
  'SOLD',
] as const;
export type ProjectionLifecycleState =
  (typeof PROJECTION_LIFECYCLE_STATES)[number];
