import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ConflictResolutionService } from './conflict-resolution.service';
import { InvalidStateTransitionException } from '../../domain/errors/state-transition.errors';
import { SaleEventEntity } from '../../infrastructure/database/entities';
import { StateGuardService } from '../state-guard/state-guard.service';

const actor = { type: 'USER' as const };

function makeManager(opts: {
  item: { id: string; status: string } | null;
  openEvents: Partial<SaleEventEntity>[];
}): EntityManager {
  const qb = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(opts.openEvents),
  };
  return {
    findOne: jest.fn().mockResolvedValue(opts.item),
    update: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as unknown as EntityManager;
}

function makeDataSource(manager: EntityManager): DataSource {
  return {
    transaction: (fn: (m: EntityManager) => unknown) => fn(manager),
  } as unknown as DataSource;
}

function makeStateGuard(): StateGuardService {
  return {
    transitionProjectionWithManager: jest.fn().mockResolvedValue(undefined),
    transitionItemWithManager: jest.fn().mockImplementation((_m, itemId) =>
      Promise.resolve({ id: itemId, status: 'SOLD' }),
    ),
  } as unknown as StateGuardService;
}

describe('ConflictResolutionService', () => {
  it('throws NotFoundException when the item does not exist', async () => {
    const manager = makeManager({ item: null, openEvents: [] });
    const service = new ConflictResolutionService(makeDataSource(manager), makeStateGuard());

    await expect(service.resolve('missing', 'event-1', actor)).rejects.toThrow(NotFoundException);
  });

  it('returns the item unchanged (idempotent replay) when it is already SOLD', async () => {
    const manager = makeManager({ item: { id: 'item-1', status: 'SOLD' }, openEvents: [] });
    const stateGuard = makeStateGuard();
    const service = new ConflictResolutionService(makeDataSource(manager), stateGuard);

    const result = await service.resolve('item-1', 'event-1', actor);

    expect(result).toEqual({ id: 'item-1', status: 'SOLD' });
    expect(stateGuard.transitionItemWithManager).not.toHaveBeenCalled();
  });

  it('rejects resolving an item that is not in SALE_CONFLICT (e.g. still LISTED)', async () => {
    const manager = makeManager({ item: { id: 'item-1', status: 'LISTED' }, openEvents: [] });
    const service = new ConflictResolutionService(makeDataSource(manager), makeStateGuard());

    await expect(service.resolve('item-1', 'event-1', actor)).rejects.toThrow(
      InvalidStateTransitionException,
    );
  });

  it('rejects a winningSaleEventId that is not an open conflicting report for this item', async () => {
    const manager = makeManager({
      item: { id: 'item-1', status: 'SALE_CONFLICT' },
      openEvents: [{ id: 'event-A', projectionId: 'proj-A' }],
    });
    const service = new ConflictResolutionService(makeDataSource(manager), makeStateGuard());

    await expect(service.resolve('item-1', 'event-does-not-exist', actor)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('marks the chosen event as winner and every other open event as loser (SOLD_HERE vs CANCEL_PENDING_TRIGGERED)', async () => {
    const manager = makeManager({
      item: { id: 'item-1', status: 'SALE_CONFLICT' },
      openEvents: [
        { id: 'event-A', projectionId: 'proj-A' },
        { id: 'event-B', projectionId: 'proj-B' },
        { id: 'event-C', projectionId: 'proj-C' },
      ],
    });
    const stateGuard = makeStateGuard();
    const service = new ConflictResolutionService(makeDataSource(manager), stateGuard);

    const result = await service.resolve('item-1', 'event-B', actor);

    expect(manager.update).toHaveBeenCalledWith(SaleEventEntity, { id: 'event-A' }, { isWinner: false });
    expect(manager.update).toHaveBeenCalledWith(SaleEventEntity, { id: 'event-B' }, { isWinner: true });
    expect(manager.update).toHaveBeenCalledWith(SaleEventEntity, { id: 'event-C' }, { isWinner: false });

    expect(stateGuard.transitionProjectionWithManager).toHaveBeenCalledWith(
      manager,
      'proj-A',
      expect.objectContaining({ type: 'CANCEL_PENDING_TRIGGERED' }),
    );
    expect(stateGuard.transitionProjectionWithManager).toHaveBeenCalledWith(
      manager,
      'proj-B',
      expect.objectContaining({ type: 'SOLD_HERE' }),
    );
    expect(stateGuard.transitionProjectionWithManager).toHaveBeenCalledWith(
      manager,
      'proj-C',
      expect.objectContaining({ type: 'CANCEL_PENDING_TRIGGERED' }),
    );

    expect(stateGuard.transitionItemWithManager).toHaveBeenCalledWith(
      manager,
      'item-1',
      expect.objectContaining({ type: 'RESOLVE_CONFLICT_SOLD', actor }),
    );
    expect(result).toEqual({ id: 'item-1', status: 'SOLD' });
  });
});
