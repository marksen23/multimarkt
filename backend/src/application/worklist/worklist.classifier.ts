import {
  BundleLifecycleState,
  ItemLifecycleState,
} from '../../domain/state-vocabulary';

/**
 * Arbeitsliste (Feature-Plan §2.5 / §3.1).
 *
 * Reine Ableitung aus bestehenden Zuständen und Zeitstempeln. Kein neues
 * Feld „zuletzt erinnert“: eine Projection, die in `ONLINE` steht, wird
 * danach nicht mehr geschrieben, bis sie den Zustand verlässt
 * (StateGuardService.save bei PUBLISH_SUCCESS). `updated_at` ist damit der
 * Zeitpunkt „online seit“.
 *
 * Ein Bundle gilt als unvollständig, solange es noch Artikel aufnehmen
 * kann (NEW oder READY) und weniger als zwei Mitglieder hat — oder noch
 * in NEW steht, weil `ITEMS_ASSIGNED` nie gelaufen ist. LISTED und später
 * sind über diesen Schritt hinaus; die Liste sucht dort keine Pakete.
 */
export const STALE_ONLINE_DAYS = 14;
export const MIN_COMPLETE_BUNDLE_ITEMS = 2;

export const WORKLIST_GROUP_IDS = [
  'AWAITING_CONFIRMATION',
  'PRICE_MISSING',
  'STALE_ONLINE',
  'SALE_CONFLICT',
  'INCOMPLETE_BUNDLE',
] as const;
export type WorklistGroupId = (typeof WORKLIST_GROUP_IDS)[number];

export const WORKLIST_REASONS = [
  'CONFIRM_CONDITION',
  'CONFIRM_ONLINE',
  'PUBLISH_LISTING',
  'SET_PRICE',
  'STALE_ONLINE',
  'RESOLVE_CONFLICT',
  'ADD_BUNDLE_ITEMS',
] as const;
export type WorklistReason = (typeof WORKLIST_REASONS)[number];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface WorklistProjectionRef {
  status: string;
  updatedAt: Date | string;
}

export interface WorklistItemRef {
  id: string;
  status: ItemLifecycleState;
  projections: WorklistProjectionRef[];
}

export interface WorklistBundleRef {
  id: string;
  status: BundleLifecycleState;
  itemCount: number;
}

export interface ItemWorklistHit {
  groupId: Exclude<WorklistGroupId, 'INCOMPLETE_BUNDLE'>;
  reason: Exclude<WorklistReason, 'ADD_BUNDLE_ITEMS'>;
  onlineSince: string | null;
  staleDays: number | null;
}

export interface BundleWorklistHit {
  groupId: 'INCOMPLETE_BUNDLE';
  reason: 'ADD_BUNDLE_ITEMS';
}

export interface ClassifiedWorklist {
  items: Map<string, ItemWorklistHit>;
  bundles: Map<string, BundleWorklistHit>;
}

export function classifyWorklist(input: {
  items: WorklistItemRef[];
  bundles: WorklistBundleRef[];
  now: Date;
  staleOnlineDays?: number;
}): ClassifiedWorklist {
  const staleOnlineDays = input.staleOnlineDays ?? STALE_ONLINE_DAYS;
  const items = new Map<string, ItemWorklistHit>();
  for (const item of input.items) {
    const hit = classifyItem(item, input.now, staleOnlineDays);
    if (hit) items.set(item.id, hit);
  }
  const bundles = new Map<string, BundleWorklistHit>();
  for (const bundle of input.bundles) {
    if (isIncompleteBundle(bundle)) {
      bundles.set(bundle.id, {
        groupId: 'INCOMPLETE_BUNDLE',
        reason: 'ADD_BUNDLE_ITEMS',
      });
    }
  }
  return { items, bundles };
}

export function classifyItem(
  item: WorklistItemRef,
  now: Date,
  staleOnlineDays: number = STALE_ONLINE_DAYS,
): ItemWorklistHit | null {
  if (item.status === 'SALE_CONFLICT') {
    return {
      groupId: 'SALE_CONFLICT',
      reason: 'RESOLVE_CONFLICT',
      onlineSince: null,
      staleDays: null,
    };
  }
  if (item.status === 'REVIEW_REQUIRED') {
    return {
      groupId: 'AWAITING_CONFIRMATION',
      reason: 'CONFIRM_CONDITION',
      onlineSince: null,
      staleDays: null,
    };
  }
  if (item.status === 'READY') {
    return {
      groupId: 'PRICE_MISSING',
      reason: 'SET_PRICE',
      onlineSince: null,
      staleDays: null,
    };
  }
  if (item.status !== 'LISTED') return null;

  const needsOnlineConfirmation = item.projections.some(
    (projection) => projection.status === 'PUBLISHING',
  );
  const needsPublish = item.projections.some(
    (projection) =>
      projection.status === 'DRAFT' || projection.status === 'READY',
  );
  if (
    needsOnlineConfirmation ||
    needsPublish ||
    item.projections.length === 0
  ) {
    return {
      groupId: 'AWAITING_CONFIRMATION',
      reason: needsOnlineConfirmation ? 'CONFIRM_ONLINE' : 'PUBLISH_LISTING',
      onlineSince: null,
      staleDays: null,
    };
  }

  const online = item.projections
    .filter((projection) => projection.status === 'ONLINE')
    .map((projection) => asDate(projection.updatedAt))
    .filter((updatedAt) => !Number.isNaN(updatedAt.getTime()));
  if (online.length === 0) return null;

  const oldest = online.reduce((left, right) =>
    left.getTime() <= right.getTime() ? left : right,
  );
  const staleDays = Math.floor((now.getTime() - oldest.getTime()) / MS_PER_DAY);
  if (staleDays < staleOnlineDays) return null;

  return {
    groupId: 'STALE_ONLINE',
    reason: 'STALE_ONLINE',
    onlineSince: oldest.toISOString(),
    staleDays,
  };
}

export function isIncompleteBundle(bundle: WorklistBundleRef): boolean {
  if (bundle.status === 'NEW') return true;
  return (
    bundle.status === 'READY' && bundle.itemCount < MIN_COMPLETE_BUNDLE_ITEMS
  );
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
