import { Injectable } from '@nestjs/common';
import type {
  AnkaufSearchProvider,
  AnkaufSearchProviderResult,
  AnkaufSearchQuery,
} from '../../domain/ankauf/ankauf-search-provider.interface';

/**
 * Ohne GEMINI_API_KEY. PLZ und Umkreis werden nicht ignoriert, indem
 * feste Beispielanzeigen zurückkommen — es gibt schlicht keine
 * eingesammelten Angebote. AnkaufResearchService hängt stattdessen
 * Links auf Kleinanzeigen, eBay, Vinted und Facebook an.
 */
@Injectable()
export class MockAnkaufSearchProvider implements AnkaufSearchProvider {
  async search(query: AnkaufSearchQuery): Promise<AnkaufSearchProviderResult | null> {
    if (!query.keywords.trim()) return null;
    return { marketMedian: null, listings: [], illustrative: true };
  }
}
