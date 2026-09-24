import { Injectable } from '@nestjs/common';
import {
  MarketDistributionProvider,
  MarketDistributionQuery,
  MarketDistributionResult,
} from '../../domain/pricing/market-distribution-provider.interface';

/**
 * Deterministischer Platzhalter für die echte Gemini-Grounding-Anbindung
 * (docs/README.md §9e) — gebunden, solange kein echter GEMINI_API_KEY
 * konfiguriert ist (siehe PriceTriangulationModule).
 */
@Injectable()
export class MockGeminiGroundingProvider implements MarketDistributionProvider {
  async search(query: MarketDistributionQuery): Promise<MarketDistributionResult | null> {
    if (!query.keywords.trim()) return null;

    return {
      median: 36,
      p25: 30,
      p75: 44,
      sampleSize: 7,
      currency: 'EUR',
      providerLabel: 'Gemini + Google Search Grounding (Mock)',
      comparableListings: [{ title: `${query.keywords} – laut Websuche (Mock)`, price: 36 }],
    };
  }
}
