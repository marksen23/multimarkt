import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SALE_CONFLICT_EVALUATION_QUEUE } from '../../infrastructure/queue/queue-names';
import { SALE_CONFLICT_SWEEP_JOB_NAME, SaleEvaluationJobData } from './sale-conflict-scheduler.service';
import { SaleConflictSweepService } from './sale-conflict-sweep.service';
import { SaleIngestionService } from './sale-ingestion.service';

/**
 * Läuft im selben Prozess wie der Web-Service (siehe render.yaml). Neben den
 * einzelnen `evaluate`-Jobs verarbeitet dieser Processor auch den
 * periodischen `sweep`-Job (SaleConflictSweepService) — derselbe Queue,
 * damit kein zweiter Redis-Consumer/-Processor nötig ist.
 */
@Processor(SALE_CONFLICT_EVALUATION_QUEUE)
export class SaleConflictEvaluationProcessor extends WorkerHost {
  private readonly logger = new Logger(SaleConflictEvaluationProcessor.name);

  constructor(
    private readonly saleIngestion: SaleIngestionService,
    private readonly sweep: SaleConflictSweepService,
  ) {
    super();
  }

  async process(job: Job<SaleEvaluationJobData>): Promise<void> {
    if (job.name === SALE_CONFLICT_SWEEP_JOB_NAME) {
      await this.sweep.sweep();
      return;
    }

    const { ownerType, ownerId } = job.data;
    const outcome =
      ownerType === 'item'
        ? await this.saleIngestion.evaluateItemSaleOutcome(ownerId)
        : await this.saleIngestion.evaluateBundleSaleOutcome(ownerId);
    this.logger.log(`Evaluated sale outcome for ${ownerType} ${ownerId}: ${outcome}`);
  }
}
