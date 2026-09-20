import { Module } from '@nestjs/common';
import { STORAGE_PROVIDER } from '../../domain/storage/storage-provider.interface';
import { LocalDiskStorageProvider } from './local-disk-storage.provider';

@Module({
  providers: [
    LocalDiskStorageProvider,
    { provide: STORAGE_PROVIDER, useClass: LocalDiskStorageProvider },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
