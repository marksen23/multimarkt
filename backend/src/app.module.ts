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
import { ApiModule } from './api/api.module';

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
    ApiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
