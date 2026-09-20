import { Module } from '@nestjs/common';
import { SaleIngestionModule } from './sale-ingestion.module';
import { SaleConflictEvaluationProcessor } from './sale-conflict-evaluation.processor';

/** Consumer-Seite — nur vom Background-Worker-Prozess importiert (worker.ts). */
@Module({
  imports: [SaleIngestionModule],
  providers: [SaleConflictEvaluationProcessor],
})
export class SaleConflictWorkerModule {}
