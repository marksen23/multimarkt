import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../domain/actor-context';
import { BundleEntity } from '../../infrastructure/database/entities';
import { StateGuardService } from '../state-guard/state-guard.service';

/**
 * Orchestriert das atomare "Items einem Bundle zuordnen" (Doc 01 §11,
 * Doc 03 §7, Doc 04 §8/§10). Nutzt bewusst die `*WithManager`-Primitive des
 * StateGuardService, damit Bundle-Insert/-Transition und ALLE
 * Item-Transitions in EINER Transaktion laufen — entweder gehen alle Items
 * + das Bundle gemeinsam auf BUNDLED/READY, oder keins.
 */
@Injectable()
export class BundleAssignmentService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stateGuard: StateGuardService,
  ) {}

  async createBundleWithItems(
    userId: string,
    title: string,
    itemIds: string[],
    actor: ActorContext,
  ): Promise<BundleEntity> {
    return this.dataSource.transaction(async (manager) => {
      const bundle = await manager.save(BundleEntity, { userId, title, status: 'NEW' });
      for (const itemId of itemIds) {
        await this.stateGuard.transitionItemWithManager(manager, itemId, {
          type: 'ASSIGN_TO_BUNDLE',
          actor,
        });
      }
      return this.stateGuard.transitionBundleWithManager(manager, bundle.id, {
        type: 'ITEMS_ASSIGNED',
        actor,
      });
    });
  }

  async addItemsToExistingBundle(
    bundleId: string,
    itemIds: string[],
    actor: ActorContext,
  ): Promise<BundleEntity> {
    return this.dataSource.transaction(async (manager) => {
      for (const itemId of itemIds) {
        await this.stateGuard.transitionItemWithManager(manager, itemId, {
          type: 'ASSIGN_TO_BUNDLE',
          actor,
        });
      }
      const bundle = await manager.findOneByOrFail(BundleEntity, { id: bundleId });
      if (bundle.status === 'NEW') {
        return this.stateGuard.transitionBundleWithManager(manager, bundleId, {
          type: 'ITEMS_ASSIGNED',
          actor,
        });
      }
      return bundle;
    });
  }
}
