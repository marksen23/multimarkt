import {
  BundleLifecycleState,
  ItemLifecycleState,
} from '../../domain/state-vocabulary';
import {
  STALE_ONLINE_DAYS,
  classifyItem,
  classifyWorklist,
  isIncompleteBundle,
  WorklistProjectionRef,
} from './worklist.classifier';

const NOW = new Date('2026-10-06T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number, extraMs = 0): Date {
  return new Date(NOW.getTime() - days * DAY_MS - extraMs);
}

function projections(
  ...entries: WorklistProjectionRef[]
): WorklistProjectionRef[] {
  return entries;
}

function item(
  status: ItemLifecycleState,
  projectionList: WorklistProjectionRef[] = [],
) {
  return { id: 'item-1', status, projections: projectionList };
}

describe('classifyItem', () => {
  it('puts REVIEW_REQUIRED into awaiting confirmation', () => {
    expect(classifyItem(item('REVIEW_REQUIRED'), NOW)).toEqual({
      groupId: 'AWAITING_CONFIRMATION',
      reason: 'CONFIRM_CONDITION',
      onlineSince: null,
      staleDays: null,
    });
  });

  it('asks to confirm online while a projection is PUBLISHING', () => {
    expect(
      classifyItem(
        item(
          'LISTED',
          projections({ status: 'PUBLISHING', updatedAt: daysAgo(1) }),
        ),
        NOW,
      ),
    ).toMatchObject({
      groupId: 'AWAITING_CONFIRMATION',
      reason: 'CONFIRM_ONLINE',
    });
  });

  it('prefers online confirmation over a still-draft sibling projection', () => {
    expect(
      classifyItem(
        item(
          'LISTED',
          projections(
            { status: 'DRAFT', updatedAt: daysAgo(1) },
            { status: 'PUBLISHING', updatedAt: daysAgo(1) },
          ),
        ),
        NOW,
      )?.reason,
    ).toBe('CONFIRM_ONLINE');
  });

  it('asks to publish a listed item that is not online yet', () => {
    expect(
      classifyItem(
        item('LISTED', projections({ status: 'DRAFT', updatedAt: daysAgo(2) })),
        NOW,
      )?.reason,
    ).toBe('PUBLISH_LISTING');
    expect(
      classifyItem(
        item('LISTED', projections({ status: 'READY', updatedAt: daysAgo(2) })),
        NOW,
      )?.reason,
    ).toBe('PUBLISH_LISTING');
    expect(classifyItem(item('LISTED'), NOW)?.reason).toBe('PUBLISH_LISTING');
  });

  it('treats READY as price missing — prepare-listing is what sets the price', () => {
    expect(classifyItem(item('READY'), NOW)).toMatchObject({
      groupId: 'PRICE_MISSING',
      reason: 'SET_PRICE',
    });
  });

  it(`flags an ONLINE projection once it has been online for ${STALE_ONLINE_DAYS} days`, () => {
    const hit = classifyItem(
      item(
        'LISTED',
        projections({
          status: 'ONLINE',
          updatedAt: daysAgo(STALE_ONLINE_DAYS),
        }),
      ),
      NOW,
    );
    expect(hit).toMatchObject({
      groupId: 'STALE_ONLINE',
      reason: 'STALE_ONLINE',
      staleDays: STALE_ONLINE_DAYS,
      onlineSince: daysAgo(STALE_ONLINE_DAYS).toISOString(),
    });
  });

  it('keeps a listing that has been online for one millisecond less than the threshold off the list', () => {
    expect(
      classifyItem(
        item(
          'LISTED',
          projections({
            status: 'ONLINE',
            updatedAt: daysAgo(STALE_ONLINE_DAYS, -1),
          }),
        ),
        NOW,
      ),
    ).toBeNull();
  });

  it('uses the oldest ONLINE projection when several channels are live', () => {
    const hit = classifyItem(
      item(
        'LISTED',
        projections(
          { status: 'ONLINE', updatedAt: daysAgo(3) },
          { status: 'ONLINE', updatedAt: daysAgo(20) },
        ),
      ),
      NOW,
    );
    expect(hit).toMatchObject({
      staleDays: 20,
      onlineSince: daysAgo(20).toISOString(),
    });
  });

  it('lets an unconfirmed publish win over a stale sibling channel', () => {
    expect(
      classifyItem(
        item(
          'LISTED',
          projections(
            { status: 'ONLINE', updatedAt: daysAgo(30) },
            { status: 'PUBLISHING', updatedAt: daysAgo(1) },
          ),
        ),
        NOW,
      )?.groupId,
    ).toBe('AWAITING_CONFIRMATION');
  });

  it('puts SALE_CONFLICT ahead of any listing age', () => {
    expect(
      classifyItem(
        item(
          'SALE_CONFLICT',
          projections({ status: 'ONLINE', updatedAt: daysAgo(40) }),
        ),
        NOW,
      ),
    ).toMatchObject({ groupId: 'SALE_CONFLICT', reason: 'RESOLVE_CONFLICT' });
  });

  it.each([
    'NEW',
    'ANALYZING',
    'BUNDLED',
    'SOLD',
    'ARCHIVED',
    'CANCELLED',
  ] as ItemLifecycleState[])('leaves %s off the work groups', (status) => {
    expect(classifyItem(item(status), NOW)).toBeNull();
  });
});

describe('isIncompleteBundle', () => {
  it('treats NEW as incomplete even when rows already exist', () => {
    expect(isIncompleteBundle({ id: 'b', status: 'NEW', itemCount: 0 })).toBe(
      true,
    );
    expect(isIncompleteBundle({ id: 'b', status: 'NEW', itemCount: 3 })).toBe(
      true,
    );
  });

  it('treats a READY bundle with fewer than two items as incomplete', () => {
    expect(isIncompleteBundle({ id: 'b', status: 'READY', itemCount: 1 })).toBe(
      true,
    );
    expect(isIncompleteBundle({ id: 'b', status: 'READY', itemCount: 2 })).toBe(
      false,
    );
  });

  it.each(['LISTED', 'SOLD', 'CANCELLED'] as BundleLifecycleState[])(
    'does not resurface a %s bundle',
    (status) => {
      expect(isIncompleteBundle({ id: 'b', status, itemCount: 1 })).toBe(false);
    },
  );
});

describe('classifyWorklist', () => {
  it('collects item and bundle hits without inventing a group for quiet stock', () => {
    const result = classifyWorklist({
      now: NOW,
      items: [
        { id: 'review', status: 'REVIEW_REQUIRED', projections: [] },
        { id: 'sold', status: 'SOLD', projections: [] },
      ],
      bundles: [
        { id: 'empty', status: 'NEW', itemCount: 0 },
        { id: 'full', status: 'READY', itemCount: 2 },
      ],
    });

    expect([...result.items.keys()]).toEqual(['review']);
    expect(result.items.get('review')?.reason).toBe('CONFIRM_CONDITION');
    expect([...result.bundles.keys()]).toEqual(['empty']);
  });
});
