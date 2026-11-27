import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MARKETPLACE_ADAPTERS,
  MarketplaceAdapterRegistry,
} from '../../domain/marketplace/marketplace-adapter.interface';
import { FormattingHelperAdapter } from '../../marketplaces/kleinanzeigen/formatting-helper.adapter';
import { EbaySellAdapter } from '../../marketplaces/ebay/ebay-sell.adapter';
import { CanonicalListingEntity, MarketplaceProjectionEntity } from '../../infrastructure/database/entities';
import { CapabilityCheckModule } from '../capability-check/capability-check.module';
import { StateGuardModule } from '../state-guard/state-guard.module';
import { EbaySetupModule } from '../ebay/ebay-setup.module';
import { MarketplacePublishingService } from './marketplace-publishing.service';

/**
 * Kleinanzeigen bleibt Formatierungshilfe. eBay ist der Sell-Inventory-Adapter:
 * ohne Token und Geschäftsrichtlinien schlägt der Aufruf mit einer deutschen
 * Meldung fehl. `MockEbayAdapter` wird hier nicht eingetragen.
 */
export function createMarketplaceAdapters(
  kleinanzeigen: FormattingHelperAdapter,
  ebay: EbaySellAdapter,
): MarketplaceAdapterRegistry {
  const adapters: MarketplaceAdapterRegistry = new Map();
  adapters.set('KLEINANZEIGEN', kleinanzeigen);
  adapters.set('EBAY', ebay);
  return adapters;
}

@Module({
  imports: [
    TypeOrmModule.forFeature([CanonicalListingEntity, MarketplaceProjectionEntity]),
    StateGuardModule,
    CapabilityCheckModule,
    EbaySetupModule,
  ],
  providers: [
    MarketplacePublishingService,
    FormattingHelperAdapter,
    EbaySellAdapter,
    {
      provide: MARKETPLACE_ADAPTERS,
      inject: [FormattingHelperAdapter, EbaySellAdapter],
      useFactory: createMarketplaceAdapters,
    },
  ],
  exports: [MarketplacePublishingService],
})
export class MarketplacePublishingModule {}
