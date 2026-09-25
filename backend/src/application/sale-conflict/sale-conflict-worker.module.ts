import { Module } from '@nestjs/common';
import { SaleIngestionModule } from './sale-ingestion.module';
import { SaleConflictEvaluationProcessor } from './sale-conflict-evaluation.processor';
import { SaleConflictSweepService } from './sale-conflict-sweep.service';

/**
 * Consumer-Seite. Stand September 2026 (siehe render.yaml): läuft im selben
 * Prozess wie der Web-Service (kostenloser Render-Plan unterstützt keinen
 * separaten Background-Worker) — `app.module.ts` importiert dieses Modul
 * direkt. `worker.ts` bleibt im Repo für einen künftigen Wechsel auf einen
 * bezahlten Plan mit echtem, getrenntem Worker-Prozess.
 */
@Module({
  imports: [SaleIngestionModule],
  providers: [SaleConflictEvaluationProcessor, SaleConflictSweepService],
})
export class SaleConflictWorkerModule {}
