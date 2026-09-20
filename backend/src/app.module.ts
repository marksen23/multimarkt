import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './infrastructure/database/database.module';
import { QueueModule } from './infrastructure/queue/bullmq.module';
import { StateGuardModule } from './application/state-guard/state-guard.module';
import { ProductAnalysisModule } from './application/product-analysis/product-analysis.module';
import { CapabilityCheckModule } from './application/capability-check/capability-check.module';
import { DispositionEngineModule } from './application/disposition/disposition-engine.module';
import { SaleIngestionModule } from './application/sale-conflict/sale-ingestion.module';
import { SaleConflictWorkerModule } from './application/sale-conflict/sale-conflict-worker.module';
import { ApiModule } from './api/api.module';

/**
 * Free-Tier-Anpassung (render.yaml, September 2026): Render Background
 * Worker unterstützen KEINEN kostenlosen Plan (nur Web Services, Postgres,
 * Key Value — siehe render.com/docs/free). `SaleConflictWorkerModule`
 * (BullMQ-Consumer) läuft deshalb hier im selben Prozess wie die HTTP-API,
 * statt in einem separaten `worker.ts`-Prozess. `worker.ts`/`worker.module.ts`
 * bleiben im Repo nutzbar, falls später auf einen bezahlten Plan mit
 * getrenntem Worker umgestellt wird.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    DatabaseModule,
    QueueModule,
    StateGuardModule,
    ProductAnalysisModule,
    CapabilityCheckModule,
    DispositionEngineModule,
    SaleIngestionModule,
    SaleConflictWorkerModule,
    ApiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
