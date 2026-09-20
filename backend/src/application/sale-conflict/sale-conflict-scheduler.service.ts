import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { SALE_CONFLICT_EVALUATION_QUEUE } from '../../infrastructure/queue/queue-names';

export type SaleEvaluationOwnerType = 'item' | 'bundle';

export interface SaleEvaluationJobData {
  ownerType: SaleEvaluationOwnerType;
  ownerId: string;
}

/**
 * Plant die verzögerte Auswertung eines Items/Bundles nach einem
 * eingehenden Sale-Report (siehe SaleIngestionService-Doku für die
 * Begründung des Debounce-Fensters). `jobId` dedupliziert mehrere Reports,
 * die innerhalb desselben Fensters eintreffen, auf EINEN Auswertungslauf —
 * `evaluate*SaleOutcome` ist zusätzlich selbst idempotent, falls trotzdem
 * mehrere Läufe feuern.
 */
@Injectable()
export class SaleConflictSchedulerService {
  constructor(
    @InjectQueue(SALE_CONFLICT_EVALUATION_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async scheduleEvaluation(ownerType: SaleEvaluationOwnerType, ownerId: string): Promise<void> {
    const delay = this.config.get<number>('SALE_CONFLICT_DEBOUNCE_MS', 15_000);
    const data: SaleEvaluationJobData = { ownerType, ownerId };
    await this.queue.add('evaluate', data, {
      jobId: `sale-eval-${ownerType}-${ownerId}`,
      delay,
      removeOnComplete: true,
      removeOnFail: 50,
    });
  }
}
