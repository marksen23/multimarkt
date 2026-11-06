import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReadyController } from './ready.controller';
import { ReadinessRedis } from './readiness-redis';
import { ReadinessService } from './readiness.service';

function serviceWith(database: () => Promise<unknown>, redisReply: () => Promise<string>): ReadinessService {
  const dataSource = { query: database } as unknown as DataSource;
  const redis: ReadinessRedis = { ping: redisReply };
  return new ReadinessService(dataSource, redis);
}

describe('ReadinessService', () => {
  it('reports ok when Postgres and Redis answer', async () => {
    const readiness = serviceWith(async () => [{ '?column?': 1 }], async () => 'PONG');
    await expect(readiness.check()).resolves.toEqual({ database: 'ok', redis: 'ok' });
  });

  it('connects a lazy client before pinging', async () => {
    const connect = jest.fn(async () => undefined);
    const ping = jest.fn(async () => 'PONG');
    const readiness = new ReadinessService({ query: async () => [1] } as unknown as DataSource, {
      status: 'wait',
      connect,
      ping,
    });
    await expect(readiness.check()).resolves.toEqual({ database: 'ok', redis: 'ok' });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('reports down without throwing when a dependency fails', async () => {
    const readiness = serviceWith(
      async () => {
        throw new Error('connection refused');
      },
      async () => 'NOPE',
    );
    await expect(readiness.check()).resolves.toEqual({ database: 'down', redis: 'down' });
  });
});

describe('ReadyController', () => {
  it('returns 200 when both checks are ok', async () => {
    const controller = new ReadyController({
      check: async () => ({ database: 'ok', redis: 'ok' }),
    } as ReadinessService);
    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      database: 'ok',
      redis: 'ok',
    });
  });

  it('returns 503 with the dependency report when one check is down', async () => {
    const controller = new ReadyController({
      check: async () => ({ database: 'down', redis: 'ok' }),
    } as ReadinessService);
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    try {
      await controller.ready();
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getStatus()).toBe(503);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        error_code: 'ERR_NOT_READY',
        message: 'Database or Redis is not ready.',
        details: { database: 'down', redis: 'ok' },
      });
    }
  });
});
