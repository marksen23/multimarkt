import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DESCRIPTION_GENERATION_PROVIDER,
  DescriptionGenerationProvider,
} from '../../domain/ai/description-generation-provider.interface';
import { MockDescriptionGenerationProvider } from '../../infrastructure/ai/mock-description-generation.provider';
import { RealGeminiDescriptionProvider } from '../../infrastructure/ai/real-gemini-description.provider';
import {
  BundleEntity,
  CanonicalListingEntity,
  ItemAttributeEntity,
  ItemEntity,
  MarketplaceProjectionEntity,
} from '../../infrastructure/database/entities';
import { PriceTriangulationModule } from '../pricing/price-triangulation.module';
import { StateGuardModule } from '../state-guard/state-guard.module';
import { CanonicalListingService } from './canonical-listing.service';
import { ListingSummaryService } from './listing-summary.service';

// Muss mit dem Platzhalter in render.yaml übereinstimmen (siehe auch
// ProductAnalysisModule/PriceTriangulationModule/ImageOptimizationModule).
const GEMINI_PLACEHOLDER_KEY = 'unused-mock-provider-active';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ItemEntity,
      ItemAttributeEntity,
      BundleEntity,
      CanonicalListingEntity,
      MarketplaceProjectionEntity,
    ]),
    StateGuardModule,
    ConfigModule,
    PriceTriangulationModule,
  ],
  providers: [
    CanonicalListingService,
    ListingSummaryService,
    {
      provide: DESCRIPTION_GENERATION_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DescriptionGenerationProvider => {
        const key = config.get<string>('GEMINI_API_KEY');
        return key && key !== GEMINI_PLACEHOLDER_KEY
          ? new RealGeminiDescriptionProvider(config)
          : new MockDescriptionGenerationProvider();
      },
    },
  ],
  exports: [CanonicalListingService, ListingSummaryService],
})
export class CanonicalListingModule {}
