import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SALE_CONFLICT_EVALUATION_QUEUE } from '../../infrastructure/queue/queue-names';
import { SaleEvaluationJobData } from './sale-conflict-scheduler.service';
import { SaleIngestionService } from './sale-ingestion.service';

/** Läuft im Background-Worker-Prozess (Render "Worker" Service, siehe worker.ts). */
@Processor(SALE_CONFLICT_EVALUATION_QUEUE)
export class SaleConflictEvaluationProcessor extends WorkerHost {
  private readonly logger = new Logger(SaleConflictEvaluationProcessor.name);

  constructor(private readonly saleIngestion: SaleIngestionService) {
    super();
  }

  async process(job: Job<SaleEvaluationJobData>): Promise<void> {
    const { ownerType, ownerId } = job.data;
    const outcome =
      ownerType === 'item'
        ? await this.saleIngestion.evaluateItemSaleOutcome(ownerId)
        : await this.saleIngestion.evaluateBundleSaleOutcome(ownerId);
    this.logger.log(`Evaluated sale outcome for ${ownerType} ${ownerId}: ${outcome}`);
  }
}
