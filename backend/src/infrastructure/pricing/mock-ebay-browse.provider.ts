import { Injectable } from '@nestjs/common';
import {
  MarketDistributionProvider,
  MarketDistributionQuery,
  MarketDistributionResult,
} from '../../domain/pricing/market-distribution-provider.interface';
import { EBAY_MISSING_KEYS_MESSAGE, MarketSearchError } from '../../domain/pricing/market-search-error';

/**
 * Ohne echte EBAY_CLIENT_ID und EBAY_CLIENT_SECRET. Erfindet keine Preise.
 * Eine Suche mit Begriffen meldet die fehlenden Schlüssel auf Deutsch.
 */
@Injectable()
export class MockEbayBrowseProvider implements MarketDistributionProvider {
  async search(query: MarketDistributionQuery): Promise<MarketDistributionResult | null> {
    if (!query.keywords.trim()) return null;
    throw new MarketSearchError('MISSING_KEYS', EBAY_MISSING_KEYS_MESSAGE);
  }
}
