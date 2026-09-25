import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { SaleConflictSchedulerService } from './sale-conflict-scheduler.service';

function makeConfig(): ConfigService {
  return { get: (_key: string, fallback: unknown) => fallback } as unknown as ConfigService;
}

describe('SaleConflictSchedulerService', () => {
  it('schedules a new evaluation job with the deterministic debounce jobId', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const getJob = jest.fn().mockResolvedValue(null);
    const queue = { add, getJob } as unknown as Queue;
    const service = new SaleConflictSchedulerService(queue, makeConfig());

    await service.scheduleEvaluation('item', 'item-1');

    expect(add).toHaveBeenCalledWith(
      'evaluate',
      { ownerType: 'item', ownerId: 'item-1' },
      expect.objectContaining({ jobId: 'sale-eval-item-item-1', attempts: 3 }),
    );
  });

  it('removes a previously FAILED job with the same jobId before scheduling again (bug fix: was silently stuck forever)', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const remove = jest.fn().mockResolvedValue(undefined);
    const isFailed = jest.fn().mockResolvedValue(true);
    const existingJob = { isFailed, remove };
    const getJob = jest.fn().mockResolvedValue(existingJob);
    const queue = { add, getJob } as unknown as Queue;
    const service = new SaleConflictSchedulerService(queue, makeConfig());

    await service.scheduleEvaluation('bundle', 'bundle-1');

    expect(getJob).toHaveBeenCalledWith('sale-eval-bundle-bundle-1');
    expect(remove).toHaveBeenCalled();
    expect(add).toHaveBeenCalled();
  });

  it('does not remove an existing job that is still pending/delayed (debounce must keep working)', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const remove = jest.fn().mockResolvedValue(undefined);
    const isFailed = jest.fn().mockResolvedValue(false);
    const existingJob = { isFailed, remove };
    const getJob = jest.fn().mockResolvedValue(existingJob);
    const queue = { add, getJob } as unknown as Queue;
    const service = new SaleConflictSchedulerService(queue, makeConfig());

    await service.scheduleEvaluation('item', 'item-2');

    expect(remove).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalled();
  });
});
