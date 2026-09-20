import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MARKETPLACE_ADAPTERS,
  MarketplaceAdapterRegistry,
} from '../../domain/marketplace/marketplace-adapter.interface';
import { MockEbayAdapter } from '../../marketplaces/ebay/mock-ebay.adapter';
import { FormattingHelperAdapter } from '../../marketplaces/kleinanzeigen/formatting-helper.adapter';
import { CanonicalListingEntity, MarketplaceProjectionEntity } from '../../infrastructure/database/entities';
import { CapabilityCheckModule } from '../capability-check/capability-check.module';
import { StateGuardModule } from '../state-guard/state-guard.module';
import { MarketplacePublishingService } from './marketplace-publishing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CanonicalListingEntity, MarketplaceProjectionEntity]),
    StateGuardModule,
    CapabilityCheckModule,
  ],
  providers: [
    MarketplacePublishingService,
    MockEbayAdapter,
    FormattingHelperAdapter,
    {
      // Registry-Pattern statt Einzel-Binding (anders als AI_VISION_PROVIDER):
      // es gibt mehrere gleichzeitig aktive Marktplätze, nicht einen
      // austauschbaren globalen Provider.
      provide: MARKETPLACE_ADAPTERS,
      inject: [MockEbayAdapter, FormattingHelperAdapter],
      useFactory: (ebay: MockEbayAdapter, kleinanzeigen: FormattingHelperAdapter): MarketplaceAdapterRegistry =>
        new Map([
          ['EBAY', ebay],
          ['KLEINANZEIGEN', kleinanzeigen],
        ]),
    },
  ],
  exports: [MarketplacePublishingService],
})
export class MarketplacePublishingModule {}
