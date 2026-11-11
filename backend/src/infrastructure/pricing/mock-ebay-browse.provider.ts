import { Injectable } from '@nestjs/common';
import {
  MarketDistributionProvider,
  MarketDistributionQuery,
  MarketDistributionResult,
} from '../../domain/pricing/market-distribution-provider.interface';

/**
 * Ohne EBAY_CLIENT_ID und EBAY_CLIENT_SECRET. Liefert bewusst keine
 * Verteilung: erfundene Mediane (früher fest 34 €) sind als
 * Startpreis durchgegangen. Vergleichssuchen laufen als Links, die der
 * Nutzer selbst öffnet.
 */
@Injectable()
export class MockEbayBrowseProvider implements MarketDistributionProvider {
  async search(query: MarketDistributionQuery): Promise<MarketDistributionResult | null> {
    void query;
    return null;
  }
}
