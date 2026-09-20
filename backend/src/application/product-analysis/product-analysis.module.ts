import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AI_VISION_PROVIDER } from '../../domain/ai/ai-vision-provider.interface';
import { MockGeminiVisionProvider } from '../../infrastructure/ai/mock-gemini-vision.provider';
import { ItemAttributeEntity, ItemEntity } from '../../infrastructure/database/entities';
import { StateGuardModule } from '../state-guard/state-guard.module';
import { ProductAnalysisService } from './product-analysis.service';

@Module({
  imports: [TypeOrmModule.forFeature([ItemEntity, ItemAttributeEntity]), StateGuardModule],
  providers: [
    ProductAnalysisService,
    // Austauschbarer Provider (Doc 01 §16): für die echte Gemini-Integration
    // wird hier nur dieses Binding ersetzt, kein Aufrufer-Code ändert sich.
    { provide: AI_VISION_PROVIDER, useClass: MockGeminiVisionProvider },
  ],
  exports: [ProductAnalysisService],
})
export class ProductAnalysisModule {}
