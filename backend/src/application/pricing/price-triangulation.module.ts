import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BUYBACK_ANCHOR_PROVIDER } from '../../domain/pricing/buyback-anchor-provider.interface';
import {
  GEMINI_GROUNDING_PROVIDER,
  MARKET_DISTRIBUTION_PROVIDER,
  MarketDistributionProvider,
} from '../../domain/pricing/market-distribution-provider.interface';
import { MockEbayBrowseProvider } from '../../infrastructure/pricing/mock-ebay-browse.provider';
import { MockGeminiGroundingProvider } from '../../infrastructure/pricing/mock-gemini-grounding.provider';
import { MockMomoxProvider } from '../../infrastructure/pricing/mock-momox.provider';
import { RealGeminiGroundingProvider } from '../../infrastructure/pricing/real-gemini-grounding.provider';
import {
  ItemAttributeEntity,
  ItemEntity,
  ItemPriceResearchEntity,
} from '../../infrastructure/database/entities';
import { PriceTriangulationService } from './price-triangulation.service';

// Muss mit dem Platzhalter in render.yaml übereinstimmen (siehe auch
// ProductAnalysisModule, dieselbe Konstante aus demselben Grund).
const GEMINI_PLACEHOLDER_KEY = 'unused-mock-provider-active';

@Module({
  imports: [
    TypeOrmModule.forFeature([ItemEntity, ItemAttributeEntity, ItemPriceResearchEntity]),
    ConfigModule,
  ],
  providers: [
    PriceTriangulationService,
    // Austauschbare Provider (docs/README.md §9e, Umsetzungsplan Phase 4/5):
    // für die echten Anbindungen wird hier nur das Binding ersetzt, kein
    // Aufrufer-Code (Service/Controller) ändert sich.
    { provide: MARKET_DISTRIBUTION_PROVIDER, useClass: MockEbayBrowseProvider },
    { provide: BUYBACK_ANCHOR_PROVIDER, useClass: MockMomoxProvider },
    // Wie ProductAnalysisModule: echtes Gemini nur, wenn ein echter
    // Schlüssel konfiguriert ist, sonst deterministischer Mock.
    {
      provide: GEMINI_GROUNDING_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): MarketDistributionProvider => {
        const key = config.get<string>('GEMINI_API_KEY');
        return key && key !== GEMINI_PLACEHOLDER_KEY
          ? new RealGeminiGroundingProvider(config)
          : new MockGeminiGroundingProvider();
      },
    },
  ],
  exports: [PriceTriangulationService],
})
export class PriceTriangulationModule {}
