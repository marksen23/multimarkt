import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PRICE_MARKDOWN_QUEUE } from '../../infrastructure/queue/queue-names';

export const PRICE_MARKDOWN_TICK_JOB = 'tick';
const PRICE_MARKDOWN_SCHEDULER_ID = 'price-markdown-tick';
const DEFAULT_TICK_MS = 60 * 60 * 1000;

/**
 * Stündlicher Takt. Ein erneuter Prozessstart aktualisiert denselben
 * Scheduler, statt einen zweiten anzulegen. Redis darf den Start nicht blockieren.
 */
@Injectable()
export class MarkdownSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(MarkdownSchedulerService.name);

  constructor(
    @InjectQueue(PRICE_MARKDOWN_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const everyMs = this.tickMs();
    const withTimeout = <T>(work: Promise<T>, ms: number): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('redis unavailable')), ms);
      });
      return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
    };
    try {
      await withTimeout(
        this.queue.upsertJobScheduler(
          PRICE_MARKDOWN_SCHEDULER_ID,
          { every: everyMs },
          { name: PRICE_MARKDOWN_TICK_JOB, data: {} },
        ),
        5_000,
      );
    } catch (error) {
      this.logger.error(`Preissenkung nicht geplant: ${(error as Error).message}`);
    }
  }

  private tickMs(): number {
    const raw = Number(this.config.get('MARKDOWN_TICK_MS', DEFAULT_TICK_MS));
    return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_TICK_MS;
  }
}
