import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  MarketplaceAdapter,
  MarketplacePublishInput,
  MarketplacePublishResult,
} from '../../domain/marketplace/marketplace-adapter.interface';

/**
 * Stub für die echte eBay Sell-API (Inventory/Offer/Fulfillment, README
 * §4a/§4c) — OAuth, Sandbox vs. Production-Freigabe sind laut README noch
 * offene "Phase 0"-Punkte, die echte Entwickler-Credentials brauchen und
 * hier bewusst nicht simuliert werden. Bildet nur das PRINZIP korrekt ab
 * (Live-API = sofortiger, echter Abschluss mit externer ID).
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
