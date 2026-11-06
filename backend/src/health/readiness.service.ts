import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { READINESS_REDIS, ReadinessRedis } from './readiness-redis';

export type DependencyCheck = 'ok' | 'down';

export interface ReadinessReport {
  database: DependencyCheck;
  redis: DependencyCheck;
}

const CHECK_TIMEOUT_MS = 2_500;

/**
 * Readiness für Coolify/Compose: der Prozess kann lauschen (/healthz),
 * während Postgres oder Redis noch nicht antworten. /ready prüft beide.
 */
@Injectable()
export class ReadinessService implements OnModuleDestroy {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(READINESS_REDIS) private readonly redis: ReadinessRedis,
  ) {}

  async check(): Promise<ReadinessReport> {
    const [database, redis] = await Promise.all([this.pingDatabase(), this.pingRedis()]);
    return { database, redis };
  }

  onModuleDestroy(): void {
    this.redis.disconnect?.();
  }

  private async pingDatabase(): Promise<DependencyCheck> {
    try {
      await this.withTimeout(this.dataSource.query('SELECT 1'), CHECK_TIMEOUT_MS);
      return 'ok';
    } catch {
      return 'down';
    }
  }

  private async pingRedis(): Promise<DependencyCheck> {
    try {
      if ((this.redis.status === 'wait' || this.redis.status === 'end') && this.redis.connect) {
        await this.withTimeout(Promise.resolve(this.redis.connect()), CHECK_TIMEOUT_MS);
      }
      const reply = await this.withTimeout(this.redis.ping(), CHECK_TIMEOUT_MS);
      return reply === 'PONG' ? 'ok' : 'down';
    } catch {
      return 'down';
    }
  }

  private withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('readiness check timed out')), ms);
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
  }
}
