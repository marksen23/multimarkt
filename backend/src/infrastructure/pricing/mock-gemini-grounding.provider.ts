import { Injectable } from '@nestjs/common';
import {
  MarketDistributionProvider,
  MarketDistributionQuery,
  MarketDistributionResult,
} from '../../domain/pricing/market-distribution-provider.interface';

/**
 * Ohne GEMINI_API_KEY. Erfindet keine Web-Preise. Die Preisansicht
 * zeigt dann die direkten Plattform-Suchen.
 */
@Injectable()
export class MockGeminiGroundingProvider implements MarketDistributionProvider {
  async search(query: MarketDistributionQuery): Promise<MarketDistributionResult | null> {
    void query;
    return null;
  }
}
