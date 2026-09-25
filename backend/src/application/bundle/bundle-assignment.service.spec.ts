import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BundleAssignmentService } from './bundle-assignment.service';
import { InvalidStateTransitionException } from '../../domain/errors/state-transition.errors';
import { BundleEntity, BundleItemEntity } from '../../infrastructure/database/entities';
import { StateGuardService } from '../state-guard/state-guard.service';

const actor = { type: 'USER' as const };

function makeManager(overrides: Partial<EntityManager> = {}): EntityManager {
  return {
    save: jest.fn().mockImplementation((_entity, data) => Promise.resolve({ id: 'bundle-1', ...data })),
    insert: jest.fn().mockResolvedValue(undefined),
    findOneBy: jest.fn(),
    ...overrides,
  } as unknown as EntityManager;
}

function makeDataSource(manager: EntityManager): DataSource {
  return {
    transaction: (fn: (m: EntityManager) => unknown) => fn(manager),
  } as unknown as DataSource;
}

function makeStateGuard(): StateGuardService {
  return {
    transitionItemWithManager: jest.fn().mockResolvedValue(undefined),
    transitionBundleWithManager: jest.fn().mockImplementation((_m, bundleId, event) =>
      Promise.resolve({ id: bundleId, status: event.type === 'ITEMS_ASSIGNED' ? 'READY' : 'NEW' }),
    ),
  } as unknown as StateGuardService;
}

describe('BundleAssignmentService', () => {
  describe('createBundleWithItems', () => {
    it('persists a bundle_items row for every assigned item (bug fix: was never inserted before)', async () => {
      const manager = makeManager();
      const stateGuard = makeStateGuard();
      const service = new BundleAssignmentService(makeDataSource(manager), stateGuard);

      await service.createBundleWithItems('user-1', 'Konvolut', ['item-1', 'item-2'], actor);

      expect(manager.insert).toHaveBeenCalledWith(
        BundleItemEntity,
        expect.arrayContaining([
          { bundleId: 'bundle-1', itemId: 'item-1' },
          { bundleId: 'bundle-1', itemId: 'item-2' },
        ]),
      );
    });
  });

  describe('addItemsToExistingBundle', () => {
    it('throws NotFoundException (not a raw findOneByOrFail error) when the bundle does not exist', async () => {
      const manager = makeManager({ findOneBy: jest.fn().mockResolvedValue(null) });
      const service = new BundleAssignmentService(makeDataSource(manager), makeStateGuard());

      await expect(service.addItemsToExistingBundle('missing', ['item-1'], actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects adding items once the bundle is already LISTED (bug fix: previously unguarded)', async () => {
      const manager = makeManager({
        findOneBy: jest.fn().mockResolvedValue({ id: 'bundle-1', status: 'LISTED' } as BundleEntity),
      });
      const service = new BundleAssignmentService(makeDataSource(manager), makeStateGuard());

      await expect(service.addItemsToExistingBundle('bundle-1', ['item-1'], actor)).rejects.toThrow(
        InvalidStateTransitionException,
      );
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('persists bundle_items rows and keeps READY as-is when adding to an already-READY bundle', async () => {
      const manager = makeManager({
        findOneBy: jest.fn().mockResolvedValue({ id: 'bundle-1', status: 'READY' } as BundleEntity),
      });
      const stateGuard = makeStateGuard();
      const service = new BundleAssignmentService(makeDataSource(manager), stateGuard);

      const result = await service.addItemsToExistingBundle('bundle-1', ['item-3'], actor);

      expect(manager.insert).toHaveBeenCalledWith(BundleItemEntity, [{ bundleId: 'bundle-1', itemId: 'item-3' }]);
      expect(stateGuard.transitionBundleWithManager).not.toHaveBeenCalled();
      expect(result.status).toBe('READY');
    });
  });
});
