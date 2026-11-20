import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PHOTO_TIP_PROVIDER, PhotoTipProvider } from '../../domain/ai/photo-tip-provider.interface';
import { ItemPhotoEntity } from '../../infrastructure/database/entities';
import { RealGeminiPhotoTipProvider } from '../../infrastructure/ai/real-gemini-photo-tip.provider';
import { UnavailablePhotoTipProvider } from '../../infrastructure/ai/unavailable-photo-tip.provider';
import { PHOTO_ENHANCEMENT_QUEUE } from '../../infrastructure/queue/queue-names';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { PhotoEnhancementService } from './photo-enhancement.service';

const GEMINI_PLACEHOLDER_KEY = 'unused-mock-provider-active';

@Module({
  imports: [
    ConfigModule,
    StorageModule,
    TypeOrmModule.forFeature([ItemPhotoEntity]),
    BullModule.registerQueue({ name: PHOTO_ENHANCEMENT_QUEUE }),
  ],
  providers: [
    PhotoEnhancementService,
    {
      provide: PHOTO_TIP_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PhotoTipProvider => {
        const key = config.get<string>('GEMINI_API_KEY');
        return key && key !== GEMINI_PLACEHOLDER_KEY
          ? new RealGeminiPhotoTipProvider(config)
          : new UnavailablePhotoTipProvider();
      },
    },
  ],
  exports: [PhotoEnhancementService],
})
export class PhotoEnhancementModule {}
