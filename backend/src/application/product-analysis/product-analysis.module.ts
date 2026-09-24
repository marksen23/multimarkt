import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AI_VISION_PROVIDER, AiVisionProvider } from '../../domain/ai/ai-vision-provider.interface';
import { MockGeminiVisionProvider } from '../../infrastructure/ai/mock-gemini-vision.provider';
import { RealGeminiVisionProvider } from '../../infrastructure/ai/real-gemini-vision.provider';
import { ItemAttributeEntity, ItemEntity } from '../../infrastructure/database/entities';
import { StateGuardModule } from '../state-guard/state-guard.module';
import { ItemAttributeConfirmationService } from './item-attribute-confirmation.service';
import { ProductAnalysisService } from './product-analysis.service';

// Muss mit dem Platzhalter in render.yaml übereinstimmen — steht dort
// (noch) kein echter Schlüssel, bleibt es beim Mock statt mit einem
// garantiert scheiternden API-Call zu crashen.
const GEMINI_PLACEHOLDER_KEY = 'unused-mock-provider-active';

@Module({
  imports: [TypeOrmModule.forFeature([ItemEntity, ItemAttributeEntity]), StateGuardModule, ConfigModule],
  providers: [
    ProductAnalysisService,
    ItemAttributeConfirmationService,
    // Austauschbarer Provider (Doc 01 §16): ob echtes Gemini oder der
    // deterministische Mock läuft, entscheidet sich zur Laufzeit an
    // GEMINI_API_KEY — kein Aufrufer-Code (ProductAnalysisService,
    // ItemsController) muss dafür wissen oder sich ändern.
    {
      provide: AI_VISION_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AiVisionProvider => {
        const key = config.get<string>('GEMINI_API_KEY');
        return key && key !== GEMINI_PLACEHOLDER_KEY
          ? new RealGeminiVisionProvider(config)
          : new MockGeminiVisionProvider();
      },
    },
  ],
  exports: [ProductAnalysisService, ItemAttributeConfirmationService],
})
export class ProductAnalysisModule {}
