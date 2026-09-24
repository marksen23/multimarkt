import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER, StorageProvider } from '../../domain/storage/storage-provider.interface';
import { LocalDiskStorageProvider } from './local-disk-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';

/**
 * Austauschbarer Provider (wie AI_VISION_PROVIDER/MARKETPLACE_ADAPTERS):
 * echtes S3(-kompatibles) Binding nur, wenn S3_BUCKET konfiguriert ist —
 * sonst weiterhin LocalDiskStorageProvider (Dev/Demo, aber auf Render
 * FLÜCHTIG, siehe dortige Doku). Ohne diesen Fallback würde ein
 * unvollständig konfigurierter S3-Zugang die App beim Start abstürzen
 * lassen statt nutzbar zu bleiben.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageProvider => {
        const bucket = config.get<string>('S3_BUCKET');
        return bucket ? new S3StorageProvider(config) : new LocalDiskStorageProvider(config);
      },
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
