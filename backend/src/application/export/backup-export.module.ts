import { Module } from '@nestjs/common';
import { BackupExportService } from './backup-export.service';

@Module({
  providers: [BackupExportService],
  exports: [BackupExportService],
})
export class BackupExportModule {}
