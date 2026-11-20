import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  MarketplaceAdapter,
  MarketplacePublishInput,
  MarketplacePublishResult,
} from '../../domain/marketplace/marketplace-adapter.interface';

/**
 * Nur ein Test-Doppelgänger für die Zustandsmaschine. Nicht im
 * MarketplacePublishingModule registrieren: eine erfundene `ebay-mock-`-ID
 * ist keine veröffentlichte Anzeige. Der Produktionsweg ist EbaySellAdapter.
 */
@Injectable()
export class MockEbayAdapter implements MarketplaceAdapter {
  async publish(input: MarketplacePublishInput): Promise<MarketplacePublishResult> {
    void input;
    return {
      externalPlatformId: `ebay-mock-${randomUUID()}`,
      requiresManualConfirmation: false,
    };
  }

  async delist(externalPlatformId: string): Promise<void> {
    void externalPlatformId;
  }
}
