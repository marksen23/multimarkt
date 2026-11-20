import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { MarkdownSchedulerService } from './markdown-scheduler.service';

describe('MarkdownSchedulerService', () => {
  it('registers one hourly tick and does not block startup when redis is down', async () => {
    const upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
    const queue = { upsertJobScheduler } as unknown as Queue;
    const config = { get: (_key: string, fallback: unknown) => fallback } as unknown as ConfigService;
    const service = new MarkdownSchedulerService(queue, config);

    await service.onModuleInit();

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'price-markdown-tick',
      { every: 60 * 60 * 1000 },
      expect.objectContaining({ name: 'tick' }),
    );
  });

  it('does not throw when redis rejects the scheduler', async () => {
    const upsertJobScheduler = jest.fn().mockRejectedValue(new Error('redis unavailable'));
    const queue = { upsertJobScheduler } as unknown as Queue;
    const config = { get: () => 60 * 60 * 1000 } as unknown as ConfigService;
    const service = new MarkdownSchedulerService(queue, config);
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});
