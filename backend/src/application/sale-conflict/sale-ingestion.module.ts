import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SALE_CONFLICT_EVALUATION_QUEUE } from '../../infrastructure/queue/queue-names';
import {
  CanonicalListingEntity,
  ItemEntity,
  MarketplaceProjectionEntity,
  SaleEventEntity,
} from '../../infrastructure/database/entities';
import { StateGuardModule } from '../state-guard/state-guard.module';
import { SaleConflictSchedulerService } from './sale-conflict-scheduler.service';
import { SaleIngestionService } from './sale-ingestion.service';

/**
 * Producer-Seite (Web-Prozess, main.ts): erfasst Reports und PLANT die
 * verzögerte Auswertung. Registriert die Queue (nötig, um Jobs
 * hinzuzufügen), aber KEINEN Processor — der läuft ausschließlich im
 * Background-Worker-Prozess (siehe SaleConflictWorkerModule / worker.ts),
 * damit nicht beide Render-Services konkurrierend Jobs konsumieren.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ItemEntity,
      CanonicalListingEntity,
      MarketplaceProjectionEntity,
      SaleEventEntity,
    ]),
    StateGuardModule,
    BullModule.registerQueue({ name: SALE_CONFLICT_EVALUATION_QUEUE }),
  ],
  providers: [SaleIngestionService, SaleConflictSchedulerService],
  exports: [SaleIngestionService, SaleConflictSchedulerService],
})
export class SaleIngestionModule {}
