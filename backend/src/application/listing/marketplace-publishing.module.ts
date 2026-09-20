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
 * Vertriebskanal-Entscheidung (docs/README.md §4e-Ergänzung, September
 * 2026): Kleinanzeigen ist der EINZIGE Verkaufskanal der App.
 * `MockEbayAdapter` (`marketplaces/ebay/mock-ebay.adapter.ts`) bleibt im
 * Repo, wird hier aber bewusst NICHT mehr registriert — eBay dient nur
 * noch als Recherche-Quelle (`PriceTriangulationModule`), nicht als
 * Publish-Ziel. Siehe auch `marketplace-capabilities.registry.ts` und
 * `disposition-engine.service.ts`, die dieselbe Entscheidung spiegeln.
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
