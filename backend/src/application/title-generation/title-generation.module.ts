import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  TITLE_GENERATION_PROVIDER,
  TitleGenerationProvider,
} from '../../domain/ai/title-generation-provider.interface';
import { MockTitleGenerationProvider } from '../../infrastructure/ai/mock-title-generation.provider';
import { RealTitleGenerationProvider } from '../../infrastructure/ai/real-title-generation.provider';
import { ItemAttributeEntity, ItemEntity } from '../../infrastructure/database/entities';
import { PriceTriangulationModule } from '../pricing/price-triangulation.module';
import { TitleGenerationService } from './title-generation.service';
import { TitleTokenAnalysisService } from './title-token-analysis.service';

// Muss mit dem Platzhalter in render.yaml übereinstimmen (siehe auch
// CanonicalListingModule/ImageOptimizationModule/ProductAnalysisModule).
const GEMINI_PLACEHOLDER_KEY = 'unused-mock-provider-active';

@Module({
  imports: [TypeOrmModule.forFeature([ItemEntity, ItemAttributeEntity]), ConfigModule, PriceTriangulationModule],
  providers: [
    TitleGenerationService,
    TitleTokenAnalysisService,
    {
      provide: TITLE_GENERATION_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): TitleGenerationProvider => {
        const key = config.get<string>('GEMINI_API_KEY');
        return key && key !== GEMINI_PLACEHOLDER_KEY
          ? new RealTitleGenerationProvider(config)
          : new MockTitleGenerationProvider();
      },
    },
  ],
  exports: [TitleGenerationService],
})
export class TitleGenerationModule {}
