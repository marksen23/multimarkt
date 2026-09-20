import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './infrastructure/database/database.module';
import { QueueModule } from './infrastructure/queue/bullmq.module';
import { SaleConflictWorkerModule } from './application/sale-conflict/sale-conflict-worker.module';

/**
 * Root-Modul für den Render "Background Worker" Service (BullMQ-Consumer).
 * Bewusst getrennt von AppModule: enthält keine Controller/HTTP-Schicht,
 * dafür alle BullMQ-Processor-Module (aktuell: Sale-Conflict-Auswertung,
 * Schritt 4/5). Künftige Worker (Publishing-Retries, S3-Garbage-Collection)
 * werden hier ergänzt.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    DatabaseModule,
    QueueModule,
    SaleConflictWorkerModule,
  ],
})
export class WorkerModule {}
