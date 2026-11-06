import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Minimale Redis-Oberfläche, damit Tests keinen echten Client brauchen. */
export interface ReadinessRedis {
  status?: string;
  ping(): Promise<string>;
  connect?: () => Promise<unknown>;
  disconnect?: () => void;
}

export const READINESS_REDIS = Symbol('READINESS_REDIS');

export function createReadinessRedis(config: ConfigService): Redis {
  const client = new Redis(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379', {
    // lazyConnect plus enableOfflineQueue:false makes the first ping fail
    // before the socket exists, even when Redis is up. Connect immediately
    // and let ReadinessService time the ping out.
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
  });
  // ping() meldet den Ausfall. Ohne Listener beendet ioredis den Prozess
  // über ein unbehandeltes error-Event, sobald Redis kurz weg ist.
  client.on('error', () => undefined);
  return client;
}
