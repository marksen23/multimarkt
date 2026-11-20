import { EbaySellException } from '../../domain/errors/ebay-sell.exception';
import {
  decideMarkdown,
  formatPricePaste,
  MarkdownItemState,
  MarkdownRunOptions,
} from '../../domain/pricing/markdown-plan';

export interface MarkdownStore {
  loadLocked(itemId: string): Promise<MarkdownItemState | null>;
  setSellingPrice(listingId: string, price: number): Promise<void>;
  setSuggestedPrice(projectionId: string, price: number): Promise<void>;
  addHistory(entry: {
    itemId: string;
    listingId: string | null;
    previousPrice: number;
    newPrice: number;
    source: 'AUTOMATIC' | 'MANUAL_CONFIRM';
    marketplaceId: string | null;
    note: string;
  }): Promise<void>;
  saveTask(entry: {
    itemId: string;
    userId: string;
    projectionId: string | null;
    marketplaceId: string;
    targetPrice: number;
    previousPrice: number;
    kind: 'MANUAL_PRICE' | 'EBAY_ERROR';
    message: string;
    detail: string | null;
    copyText: string;
  }): Promise<void>;
  supersedeOpenManual(itemId: string, now: Date): Promise<void>;
  dismissOpenErrors(itemId: string, now: Date): Promise<void>;
  touchPlan(
    itemId: string,
    userId: string,
    patch: { lastAppliedAt?: Date | null; lastAttemptAt?: Date | null; lastError: string | null },
  ): Promise<void>;
}

export interface EbayPricePort {
  update(input: { sku: string; offerId: string; priceEur: number }): Promise<void>;
}

/**
 * Eine fällige Senkung. Der Preis einer verkauften Anzeige bleibt, weil
 * `decideMarkdown` bei jedem Status außer LISTED abbricht — und der Aufrufer
 * den Artikel in derselben Transaktion gesperrt neu liest.
 */
export async function runMarkdownItem(
  store: MarkdownStore,
  ebay: EbayPricePort,
  itemId: string,
  options: MarkdownRunOptions,
): Promise<void> {
  const state = await store.loadLocked(itemId);
  if (!state) return;
  const decision = decideMarkdown(state, options);
  if (decision.type !== 'drop') return;

  const failures: string[] = [];
  let remoteUpdates = 0;
  for (const offer of decision.ebay) {
    try {
      await ebay.update({ sku: offer.sku, offerId: offer.offerId, priceEur: decision.nextPrice });
      remoteUpdates += 1;
    } catch (error) {
      failures.push(germanEbayFailure(error));
      break;
    }
  }

  if (failures.length > 0) {
    const extra =
      remoteUpdates > 0
        ? 'Ein eBay-Angebot wurde schon geändert. Der Preis in der App bleibt, bis die Änderung überall durch ist.'
        : 'Der Preis bleibt.';
    await store.touchPlan(state.itemId, state.userId, {
      lastAttemptAt: options.now,
      lastError: `${failures[0]} ${extra}`,
    });
    await store.saveTask({
      itemId: state.itemId,
      userId: state.userId,
      projectionId: decision.ebay[remoteUpdates]?.projectionId ?? decision.ebay[0]?.projectionId ?? null,
      marketplaceId: 'EBAY',
      targetPrice: decision.nextPrice,
      previousPrice: decision.previousPrice,
      kind: 'EBAY_ERROR',
      message: failures[0],
      detail: extra,
      copyText: formatPricePaste(decision.nextPrice),
    });
    return;
  }

  if (decision.ebay.length > 0 && state.listingId) {
    await store.setSellingPrice(state.listingId, decision.nextPrice);
    for (const offer of decision.ebay) {
      await store.setSuggestedPrice(offer.projectionId, decision.nextPrice);
    }
    await store.addHistory({
      itemId: state.itemId,
      listingId: state.listingId,
      previousPrice: decision.previousPrice,
      newPrice: decision.nextPrice,
      source: 'AUTOMATIC',
      marketplaceId: 'EBAY',
      note: decision.note,
    });
    await store.dismissOpenErrors(state.itemId, options.now);
  }

  if (decision.manual.length > 0) {
    await store.supersedeOpenManual(state.itemId, options.now);
    for (const task of decision.manual) {
      await store.saveTask({
        itemId: state.itemId,
        userId: state.userId,
        projectionId: task.projectionId,
        marketplaceId: task.marketplaceId,
        targetPrice: decision.nextPrice,
        previousPrice: decision.previousPrice,
        kind: 'MANUAL_PRICE',
        message: task.message,
        detail: task.detail,
        copyText: task.copyText,
      });
    }
  }

  await store.touchPlan(state.itemId, state.userId, {
    lastAppliedAt: options.now,
    lastAttemptAt: options.now,
    lastError: null,
  });
}

export function germanEbayFailure(error: unknown): string {
  if (error instanceof EbaySellException) {
    const body = error.getResponse();
    if (typeof body === 'string' && body.trim()) return body.trim();
    if (body && typeof body === 'object' && 'message' in body) {
      const message = (body as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message.trim();
    }
  }
  return 'eBay hat die Preisänderung abgelehnt.';
}
