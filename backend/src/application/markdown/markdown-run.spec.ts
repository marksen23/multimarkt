import { EbaySellException } from '../../domain/errors/ebay-sell.exception';
import { MarkdownItemState, priceDropMessage } from '../../domain/pricing/markdown-plan';
import { EbayPricePort, MarkdownStore, runMarkdownItem } from './markdown-run';

const now = new Date('2026-10-09T10:00:00.000Z');
const onlineSince = new Date('2026-10-01T10:00:00.000Z');

function state(partial: Partial<MarkdownItemState> = {}): MarkdownItemState {
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
    projections: [
      {
        id: 'klein-1',
        marketplaceId: 'KLEINANZEIGEN',
        status: 'ONLINE',
        externalPlatformId: null,
        publishMeta: {},
        onlineSince,
      },
    ],
    openTasks: [],
    photoCount: 3,
    ...partial,
  };
}

class MemoryStore implements MarkdownStore {
  price: number | null = 40;
  history: unknown[] = [];
  tasks: unknown[] = [];
  plan: { lastAppliedAt?: Date | null; lastAttemptAt?: Date | null; lastError: string | null } | null = null;
  suggested = new Map<string, number>();

  constructor(private readonly loaded: MarkdownItemState | null) {}

  loadLocked(): Promise<MarkdownItemState | null> {
    return Promise.resolve(this.loaded);
  }

  async setSellingPrice(_listingId: string, price: number): Promise<void> {
    this.price = price;
  }

  async setSuggestedPrice(projectionId: string, price: number): Promise<void> {
    this.suggested.set(projectionId, price);
  }

  async addHistory(entry: unknown): Promise<void> {
    this.history.push(entry);
  }

  async saveTask(entry: unknown): Promise<void> {
    this.tasks.push(entry);
  }

  async supersedeOpenManual(): Promise<void> {}

  async dismissOpenErrors(): Promise<void> {}

  async touchPlan(
    _itemId: string,
    _userId: string,
    patch: { lastAppliedAt?: Date | null; lastAttemptAt?: Date | null; lastError: string | null },
  ): Promise<void> {
    this.plan = patch;
  }
}

const options = { now, retryMs: 12 * 60 * 60 * 1000, ebayApiConfigured: true };

describe('runMarkdownItem', () => {
  it('does not touch the price of a sold item', async () => {
    const store = new MemoryStore(state({ itemStatus: 'SOLD' }));
    const ebay: EbayPricePort = { update: jest.fn() };
    await runMarkdownItem(store, ebay, 'item-1', options);
    expect(ebay.update).not.toHaveBeenCalled();
    expect(store.price).toBe(40);
    expect(store.history).toEqual([]);
    expect(store.tasks).toEqual([]);
  });

  it('updates eBay and the stored price, and stops at the floor', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const store = new MemoryStore(
      state({
        currentPrice: 32,
        projections: [
          {
            id: 'ebay-1',
            marketplaceId: 'EBAY',
            status: 'ONLINE',
            externalPlatformId: '334455667788',
            publishMeta: { sku: 'sku-1', offerId: 'offer-9' },
            onlineSince,
          },
        ],
      }),
    );
    await runMarkdownItem(store, { update }, 'item-1', options);
    expect(update).toHaveBeenCalledWith({ sku: 'sku-1', offerId: 'offer-9', priceEur: 30 });
    expect(store.price).toBe(30);
    expect(store.history).toEqual([
      expect.objectContaining({ previousPrice: 32, newPrice: 30, source: 'AUTOMATIC' }),
    ]);
    expect(store.price).toBeGreaterThanOrEqual(30);
  });

  it('keeps the price and records a German eBay error', async () => {
    const store = new MemoryStore(
      state({
        projections: [
          {
            id: 'ebay-1',
            marketplaceId: 'EBAY',
            status: 'ONLINE',
            externalPlatformId: '334455667788',
            publishMeta: { sku: 'sku-1', offerId: 'offer-9' },
            onlineSince,
          },
        ],
      }),
    );
    const ebay: EbayPricePort = {
      update: jest.fn().mockRejectedValue(new EbaySellException('eBay meldet: Offer not available. (Fehler 25002)')),
    };
    await runMarkdownItem(store, ebay, 'item-1', options);
    expect(store.price).toBe(40);
    expect(store.history).toEqual([]);
    expect(store.plan?.lastError).toMatch(/Offer not available/);
    expect(store.plan?.lastError).toMatch(/Der Preis bleibt/);
    expect(store.plan?.lastAppliedAt).toBeUndefined();
    expect(store.tasks).toEqual([
      expect.objectContaining({ kind: 'EBAY_ERROR', marketplaceId: 'EBAY' }),
    ]);
  });

  it('creates a copy task for Kleinanzeigen and does not invent an API call', async () => {
    const store = new MemoryStore(state());
    const ebay: EbayPricePort = { update: jest.fn() };
    await runMarkdownItem(store, ebay, 'item-1', options);
    expect(ebay.update).not.toHaveBeenCalled();
    expect(store.price).toBe(40);
    expect(store.tasks).toEqual([
      expect.objectContaining({
        kind: 'MANUAL_PRICE',
        message: priceDropMessage(36),
        copyText: '36,00',
      }),
    ]);
  });
});
