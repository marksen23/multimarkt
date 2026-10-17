import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MARKETPLACE_ADAPTERS,
  MarketplaceAdapterRegistry,
} from '../../domain/marketplace/marketplace-adapter.interface';
import { FormattingHelperAdapter } from '../../marketplaces/kleinanzeigen/formatting-helper.adapter';
import { CanonicalListingEntity, MarketplaceProjectionEntity } from '../../infrastructure/database/entities';
import { CapabilityCheckModule } from '../capability-check/capability-check.module';
import { StateGuardModule } from '../state-guard/state-guard.module';
import { MarketplacePublishingService } from './marketplace-publishing.service';

/**
 * Kanal-Karten (Kleinanzeigen, Vinted, eBay) sind Kopierwege und rufen
 * diesen Publish-Pfad nicht auf. `MockEbayAdapter` bleibt unregistriert:
 * eine erfundene eBay-ID gilt nicht als veröffentlicht. Der Adapter-Eintrag
 * hier ist nur noch die Kleinanzeigen-Formatierungshilfe für den älteren
 * Publish-Endpunkt.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CanonicalListingEntity, MarketplaceProjectionEntity]),
    StateGuardModule,
    CapabilityCheckModule,
  ],
  providers: [
    MarketplacePublishingService,
    FormattingHelperAdapter,
    {
      // Registry-Pattern statt Einzel-Binding (anders als AI_VISION_PROVIDER):
      // auch mit nur einem aktiven Marktplatz bleibt die Map-Form, damit ein
      // künftiger zweiter Kanal ohne Interface-Änderung dazukommt.
      provide: MARKETPLACE_ADAPTERS,
      inject: [FormattingHelperAdapter],
      useFactory: (kleinanzeigen: FormattingHelperAdapter): MarketplaceAdapterRegistry =>
        new Map([['KLEINANZEIGEN', kleinanzeigen]]),
    },
  ],
  exports: [MarketplacePublishingService],
})
export class MarketplacePublishingModule {}
