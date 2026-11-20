import {
  attentionCard,
  decideMarkdown,
  describeMarkdown,
  formatEuroDe,
  MarkdownItemState,
  MarkdownProjectionState,
  nextMarkdownPrice,
  planConfirm,
  priceDropMessage,
} from './markdown-plan';

const now = new Date('2026-10-09T10:00:00.000Z');
const onlineSince = new Date('2026-10-01T10:00:00.000Z');

function projection(partial: Partial<MarkdownProjectionState>): MarkdownProjectionState {
  return {
    id: 'proj-1',
    marketplaceId: 'KLEINANZEIGEN',
    status: 'ONLINE',
    externalPlatformId: null,
    publishMeta: {},
    onlineSince,
    ...partial,
  };
}

function item(partial: Partial<MarkdownItemState> = {}): MarkdownItemState {
  return {
    userId: 'user-1',
    itemId: 'item-1',
    itemStatus: 'LISTED',
    title: 'Jacke',
    settings: { enabled: true, percent: 10, intervalDays: 7, attentionAfterDays: 21 },
    override: null,
    currentPrice: 40,
    listingId: 'listing-1',
    onlineSince,
    suggestionFloor: 30,
    projections: [projection({})],
    openTasks: [],
    photoCount: 4,
    ...partial,
  };
}

const due = { now, retryMs: 12 * 60 * 60 * 1000, ebayApiConfigured: true };

describe('nextMarkdownPrice', () => {
  it('lowers by the percent and never under the floor', () => {
    expect(nextMarkdownPrice(40, 10, 30)).toEqual({ price: 36, reachedFloor: false });
    expect(nextMarkdownPrice(32, 10, 30)).toEqual({ price: 30, reachedFloor: true });
    expect(nextMarkdownPrice(30, 10, 30)).toBeNull();
    expect(nextMarkdownPrice(12, 90, 10)?.price).toBe(10);
  });
});

describe('decideMarkdown', () => {
  it('stays quiet while the default is off', () => {
    const decision = decideMarkdown(
      item({ settings: { enabled: false, percent: 10, intervalDays: 7, attentionAfterDays: 21 } }),
      due,
    );
    expect(decision).toEqual({ type: 'skip', reason: 'inactive' });
  });

  it('drops a listed item to the next step and asks Kleinanzeigen to copy the price', () => {
    const decision = decideMarkdown(item(), due);
    expect(decision).toMatchObject({
      type: 'drop',
      previousPrice: 40,
      nextPrice: 36,
      manual: [
        {
          marketplaceId: 'KLEINANZEIGEN',
          message: 'Preis auf 36,00 € senken',
          copyText: '36,00',
        },
      ],
      ebay: [],
    });
  });

  it('sends a real eBay offer to the API and keeps Vinted as a task', () => {
    const decision = decideMarkdown(
      item({
        projections: [
          projection({
            id: 'ebay-1',
            marketplaceId: 'EBAY',
            externalPlatformId: '334455667788',
            publishMeta: { sku: 'sku-1', offerId: 'offer-9' },
          }),
          projection({ id: 'vinted-1', marketplaceId: 'VINTED' }),
        ],
      }),
      due,
    );
    expect(decision).toMatchObject({
      type: 'drop',
      nextPrice: 36,
      ebay: [{ projectionId: 'ebay-1', sku: 'sku-1', offerId: 'offer-9' }],
      manual: [{ projectionId: 'vinted-1', marketplaceId: 'VINTED', message: priceDropMessage(36) }],
    });
  });

  it('does not call eBay for an invented id or when the API is not configured', () => {
    const mockId = decideMarkdown(
      item({
        projections: [
          projection({
            marketplaceId: 'EBAY',
            externalPlatformId: 'ebay-mock-1',
            publishMeta: { offerId: 'offer-1' },
          }),
        ],
      }),
      due,
    );
    expect(mockId).toMatchObject({
      type: 'drop',
      ebay: [],
      manual: [{ marketplaceId: 'EBAY', message: 'Preis auf 36,00 € senken' }],
    });
    if (mockId.type === 'drop') {
      expect(mockId.manual[0].detail).toMatch(/nicht über die Sell API/);
    }

    const unconfigured = decideMarkdown(
      item({
        projections: [
          projection({
            marketplaceId: 'EBAY',
            externalPlatformId: '334455667788',
            publishMeta: { offerId: 'offer-9', sku: 'sku-1' },
          }),
        ],
      }),
      { ...due, ebayApiConfigured: false },
    );
    expect(unconfigured).toMatchObject({ type: 'drop', ebay: [] });
    if (unconfigured.type === 'drop') {
      expect(unconfigured.manual[0].detail).toMatch(/nicht eingerichtet/);
    }
  });

  it('does not change a sold item, a paused plan, or a price already at the floor', () => {
    expect(decideMarkdown(item({ itemStatus: 'SOLD' }), due)).toEqual({ type: 'skip', reason: 'not_listed' });
    expect(
      decideMarkdown(
        item({
          override: {
            status: 'PAUSED',
            percent: null,
            intervalDays: null,
            floorPrice: null,
            lastAppliedAt: null,
            lastAttemptAt: null,
            lastError: null,
          },
        }),
        due,
      ),
    ).toEqual({ type: 'skip', reason: 'paused' });
    expect(decideMarkdown(item({ currentPrice: 30 }), due)).toEqual({ type: 'skip', reason: 'at_floor' });
  });

  it('lets one article opt in while the account default stays off', () => {
    const decision = decideMarkdown(
      item({
        settings: { enabled: false, percent: 10, intervalDays: 7, attentionAfterDays: 21 },
        override: {
          status: 'ACTIVE',
          percent: 5,
          intervalDays: 7,
          floorPrice: 20,
          lastAppliedAt: null,
          lastAttemptAt: null,
          lastError: null,
        },
      }),
      due,
    );
    expect(decision).toMatchObject({ type: 'drop', nextPrice: 38 });
  });

  it('uses the seller floor instead of the suggestion and waits for an open task', () => {
    const waiting = decideMarkdown(
      item({
        openTasks: [
          {
            id: 'task-1',
            projectionId: 'proj-1',
            marketplaceId: 'KLEINANZEIGEN',
            targetPrice: 36,
            previousPrice: 40,
            status: 'OPEN',
            kind: 'MANUAL_PRICE',
            message: priceDropMessage(36),
            detail: null,
            copyText: '36,00',
          },
        ],
      }),
      due,
    );
    expect(waiting).toEqual({ type: 'skip', reason: 'waiting_for_confirm' });
    expect(describeMarkdown(item({ suggestionFloor: null }), now).summary).toMatch(/Mindestpreis fehlt/);
  });

  it('waits out the interval and a failed eBay attempt', () => {
    const fresh = decideMarkdown(item({ onlineSince: new Date('2026-10-08T10:00:00.000Z') }), due);
    expect(fresh).toEqual({ type: 'skip', reason: 'not_due' });
    const failed = decideMarkdown(
      item({
        override: {
          status: 'INHERIT',
          percent: null,
          intervalDays: null,
          floorPrice: null,
          lastAppliedAt: null,
          lastAttemptAt: new Date('2026-10-09T08:00:00.000Z'),
          lastError: 'eBay hat abgelehnt.',
        },
      }),
      due,
    );
    expect(failed).toEqual({ type: 'skip', reason: 'retry_wait' });
  });
});

describe('planConfirm', () => {
  it('refuses a sold item and a price under the floor', () => {
    expect(planConfirm({ itemStatus: 'SOLD', currentPrice: 40, targetPrice: 36, floorPrice: 30 })).toEqual({
      type: 'dismiss',
      message: 'Der Artikel ist verkauft oder nicht mehr online. Der Preis bleibt.',
    });
    expect(planConfirm({ itemStatus: 'LISTED', currentPrice: 40, targetPrice: 10, floorPrice: 30 }).type).toBe(
      'reject',
    );
  });

  it('lowers only when the confirmed price is under the current one', () => {
    expect(planConfirm({ itemStatus: 'LISTED', currentPrice: 40, targetPrice: 36, floorPrice: 30 })).toMatchObject({
      type: 'complete',
      changePrice: true,
      nextPrice: 36,
    });
    expect(planConfirm({ itemStatus: 'LISTED', currentPrice: 36, targetPrice: 36, floorPrice: 30 })).toMatchObject({
      type: 'complete',
      changePrice: false,
    });
  });
});

describe('attentionCard', () => {
  it('stays hidden before the deadline and then names price, photos and a new analysis', () => {
    expect(attentionCard(item(), now)).toBeNull();
    const card = attentionCard(
      item({
        onlineSince: new Date('2026-09-01T10:00:00.000Z'),
        photoCount: 1,
        projections: [projection({ onlineSince: new Date('2026-09-01T10:00:00.000Z') })],
      }),
      now,
    );
    expect(card?.suggestions.map((suggestion) => suggestion.title)).toEqual([
      'Preis senken',
      'Fotos verbessern',
      'Analyse erneut ausführen',
    ]);
    expect(card?.suggestions[1].detail).toMatch(/Nur 1 Foto/);
    expect(card?.daysOnline).toBeGreaterThanOrEqual(21);
  });
});

describe('formatEuroDe', () => {
  it('uses a German amount', () => {
    expect(formatEuroDe(32)).toBe('32,00 €');
    expect(priceDropMessage(32)).toBe('Preis auf 32,00 € senken');
  });
});
