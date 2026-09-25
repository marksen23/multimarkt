import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { SaleConflictSweepService } from './sale-conflict-sweep.service';
import { SaleConflictSchedulerService } from './sale-conflict-scheduler.service';

function makeConfig(): ConfigService {
  return { get: (_key: string, fallback: unknown) => fallback } as unknown as ConfigService;
}

function makeDataSource(itemRows: { itemId: string }[], bundleRows: { bundleId: string }[]): DataSource {
  let callIndex = 0;
  const results = [itemRows, bundleRows];
  const qb = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockImplementation(() => Promise.resolve(results[callIndex++])),
  };
  return {
    manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) },
  } as unknown as DataSource;
}

describe('SaleConflictSweepService', () => {
  it('reschedules evaluation for every stuck item and bundle it finds', async () => {
    const dataSource = makeDataSource([{ itemId: 'item-1' }, { itemId: 'item-2' }], [{ bundleId: 'bundle-1' }]);
    const scheduler = { scheduleEvaluation: jest.fn().mockResolvedValue(undefined) } as unknown as SaleConflictSchedulerService;
    const service = new SaleConflictSweepService(dataSource, scheduler, makeConfig());

    const total = await service.sweep();

    expect(total).toBe(3);
    expect(scheduler.scheduleEvaluation).toHaveBeenCalledWith('item', 'item-1');
    expect(scheduler.scheduleEvaluation).toHaveBeenCalledWith('item', 'item-2');
    expect(scheduler.scheduleEvaluation).toHaveBeenCalledWith('bundle', 'bundle-1');
  });

  it('reschedules nothing and returns 0 when there are no stuck owners', async () => {
    const dataSource = makeDataSource([], []);
    const scheduler = { scheduleEvaluation: jest.fn().mockResolvedValue(undefined) } as unknown as SaleConflictSchedulerService;
    const service = new SaleConflictSweepService(dataSource, scheduler, makeConfig());

    const total = await service.sweep();

    expect(total).toBe(0);
    expect(scheduler.scheduleEvaluation).not.toHaveBeenCalled();
  });
});
