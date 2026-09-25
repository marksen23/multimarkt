import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { SALE_CONFLICT_EVALUATION_QUEUE } from '../../infrastructure/queue/queue-names';

export type SaleEvaluationOwnerType = 'item' | 'bundle';

export interface SaleEvaluationJobData {
  ownerType: SaleEvaluationOwnerType;
  ownerId: string;
}

/** Job-Name für den periodischen Selbstheilungs-Sweep (siehe SaleConflictSweepService). */
export const SALE_CONFLICT_SWEEP_JOB_NAME = 'sweep';
const SALE_CONFLICT_SWEEP_SCHEDULER_ID = 'sale-conflict-sweep-recurring';

/**
 * Plant die verzögerte Auswertung eines Items/Bundles nach einem
 * eingehenden Sale-Report (siehe SaleIngestionService-Doku für die
 * Begründung des Debounce-Fensters). `jobId` dedupliziert mehrere Reports,
 * die innerhalb desselben Fensters eintreffen, auf EINEN Auswertungslauf —
 * `evaluate*SaleOutcome` ist zusätzlich selbst idempotent, falls trotzdem
 * mehrere Läufe feuern.
 */
@Injectable()
export class SaleConflictSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SaleConflictSchedulerService.name);

  constructor(
    @InjectQueue(SALE_CONFLICT_EVALUATION_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  /**
   * Registriert den Selbstheilungs-Sweep als BullMQ-"Job Scheduler"
   * (`upsertJobScheduler` — idempotent, ein erneuter Aufruf bei jedem
   * Prozess-Neustart aktualisiert nur denselben Eintrag statt zu
   * duplizieren). Läuft im selben Prozess wie der Web-Service (siehe
   * render.yaml-Kommentar zu SaleConflictWorkerModule).
   */
  async onModuleInit(): Promise<void> {
    const everyMs = this.config.get<number>('SALE_CONFLICT_SWEEP_INTERVAL_MS', 5 * 60 * 1000);
    try {
      await this.queue.upsertJobScheduler(
        SALE_CONFLICT_SWEEP_SCHEDULER_ID,
        { every: everyMs },
        { name: SALE_CONFLICT_SWEEP_JOB_NAME, data: {} },
      );
    } catch (error) {
      // Darf den Prozessstart nie verhindern — der Sweep ist ein
      // Zusatz-Sicherheitsnetz, kein Pflichtpfad (Doc-03-Prinzip: der
      // Kern-Ingestion-Pfad bleibt unabhängig von Redis-Verfügbarkeit).
      this.logger.error(`Could not register sale-conflict sweep scheduler: ${(error as Error).message}`);
    }
  }

  async scheduleEvaluation(ownerType: SaleEvaluationOwnerType, ownerId: string): Promise<void> {
    const delay = this.config.get<number>('SALE_CONFLICT_DEBOUNCE_MS', 15_000);
    const jobId = `sale-eval-${ownerType}-${ownerId}`;
    const data: SaleEvaluationJobData = { ownerType, ownerId };

    // Bug-Fix (September 2026): BullMQ gibt bei add() mit einer bereits
    // existierenden jobId den vorhandenen Job zurück, statt einen neuen zu
    // planen — auch wenn dieser Job bereits fehlgeschlagen ist (removeOnFail
    // hält ihn vorrätig, statt ihn sofort zu entfernen). Ohne diese Prüfung
    // würde ein einziger Auswertungsfehler (DB-Hänger, Deadlock, ...) das
    // Item/Bundle für immer in LISTED hängen lassen: jeder spätere
    // Sale-Report für denselben Owner würde stillschweigend nichts mehr
    // planen, ohne dass das irgendwo sichtbar würde (der Webhook antwortet
    // trotzdem mit 202).
    const existing = await this.queue.getJob(jobId);
    if (existing && (await existing.isFailed())) {
      await existing.remove();
    }

    await this.queue.add('evaluate', data, {
      jobId,
      delay,
      // Zusätzlich, unabhängig vom Bug oben: transiente Fehler (kurzer
      // DB-Verbindungsabbruch etc.) sollen sich selbst heilen, statt beim
      // ersten Versuch endgültig aufzugeben.
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: 50,
    });
  }
}
