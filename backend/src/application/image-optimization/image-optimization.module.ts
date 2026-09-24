import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  IMAGE_OPTIMIZATION_PROVIDER,
  ImageOptimizationProvider,
} from '../../domain/ai/image-optimization-provider.interface';
import { MockImageOptimizationProvider } from '../../infrastructure/ai/mock-image-optimization.provider';
import { RealImageOptimizationProvider } from '../../infrastructure/ai/real-image-optimization.provider';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { ImageOptimizationService } from './image-optimization.service';

// Muss mit dem Platzhalter in render.yaml übereinstimmen (siehe auch
// ProductAnalysisModule/PriceTriangulationModule, dieselbe Konstante).
const GEMINI_PLACEHOLDER_KEY = 'unused-mock-provider-active';

@Module({
  imports: [ConfigModule, StorageModule],
  providers: [
    ImageOptimizationService,
    {
      provide: IMAGE_OPTIMIZATION_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ImageOptimizationProvider => {
        const key = config.get<string>('GEMINI_API_KEY');
        return key && key !== GEMINI_PLACEHOLDER_KEY
          ? new RealImageOptimizationProvider(config)
          : new MockImageOptimizationProvider();
      },
    },
  ],
  exports: [ImageOptimizationService],
})
export class ImageOptimizationModule {}
