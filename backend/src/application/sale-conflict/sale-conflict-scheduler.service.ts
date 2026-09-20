import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { SALE_CONFLICT_EVALUATION_QUEUE } from '../../infrastructure/queue/queue-names';

/**
 * Plant die verzögerte Auswertung eines Items nach einem eingehenden
 * Sale-Report (siehe SaleIngestionService-Doku für die Begründung des
 * Debounce-Fensters). `jobId` pro Item dedupliziert mehrere Reports, die
 * innerhalb desselben Fensters eintreffen, auf EINEN Auswertungslauf —
 * `evaluateItemSaleOutcome` ist zusätzlich selbst idempotent, falls
 * trotzdem mehrere Läufe feuern.
 */
@Injectable()
export class SaleConflictSchedulerService {
  constructor(
    @InjectQueue(SALE_CONFLICT_EVALUATION_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async scheduleEvaluation(itemId: string): Promise<void> {
    const delay = this.config.get<number>('SALE_CONFLICT_DEBOUNCE_MS', 15_000);
    await this.queue.add(
      'evaluate',
      { itemId },
      { jobId: `sale-eval-${itemId}`, delay, removeOnComplete: true, removeOnFail: 50 },
    );
  }
}
