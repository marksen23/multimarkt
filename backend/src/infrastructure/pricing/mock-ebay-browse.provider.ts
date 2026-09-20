import { Injectable } from '@nestjs/common';
import {
  MarketDistributionProvider,
  MarketDistributionQuery,
  MarketDistributionResult,
} from '../../domain/pricing/market-distribution-provider.interface';

/**
 * Deterministischer Stub für die echte eBay-Browse-API-Anbindung
 * (docs/README.md §9e, Umsetzungsplan Phase 4 — braucht echte
 * `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`, die noch nicht vorliegen).
 * Liefert bei leeren Keywords bewusst `null` statt einer erfundenen
 * Verteilung ("Never silently invent" gilt auch für Preisdaten).
 */
@Injectable()
export class MockEbayBrowseProvider implements MarketDistributionProvider {
  async search(query: MarketDistributionQuery): Promise<MarketDistributionResult | null> {
    if (!query.keywords.trim()) return null;

    return {
      median: 34,
      p25: 28,
      p75: 41,
      sampleSize: 12,
      currency: 'EUR',
      providerLabel: 'eBay Browse API (Mock)',
      comparableListings: [
        { title: `${query.keywords} - sehr guter Zustand, kaum getragen`, price: 38 },
        { title: `${query.keywords} TOP Zustand mit OVP`, price: 41 },
        { title: `${query.keywords} gebraucht, Gebrauchsspuren`, price: 28 },
      ],
    };
  }
}
