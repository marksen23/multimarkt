import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BUYBACK_ANCHOR_PROVIDER } from '../../domain/pricing/buyback-anchor-provider.interface';
import { MARKET_DISTRIBUTION_PROVIDER } from '../../domain/pricing/market-distribution-provider.interface';
import { MockEbayBrowseProvider } from '../../infrastructure/pricing/mock-ebay-browse.provider';
import { MockMomoxProvider } from '../../infrastructure/pricing/mock-momox.provider';
import {
  ItemAttributeEntity,
  ItemEntity,
  ItemPriceResearchEntity,
} from '../../infrastructure/database/entities';
import { PriceTriangulationService } from './price-triangulation.service';

@Module({
  imports: [TypeOrmModule.forFeature([ItemEntity, ItemAttributeEntity, ItemPriceResearchEntity])],
  providers: [
    PriceTriangulationService,
    // Austauschbare Provider (docs/README.md §9e, Umsetzungsplan Phase 4/5):
    // für die echten Anbindungen wird hier nur das Binding ersetzt, kein
    // Aufrufer-Code (Service/Controller) ändert sich.
    { provide: MARKET_DISTRIBUTION_PROVIDER, useClass: MockEbayBrowseProvider },
    { provide: BUYBACK_ANCHOR_PROVIDER, useClass: MockMomoxProvider },
  ],
  exports: [PriceTriangulationService],
})
export class PriceTriangulationModule {}
