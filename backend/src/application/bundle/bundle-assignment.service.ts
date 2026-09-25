import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../domain/actor-context';
import { InvalidStateTransitionException } from '../../domain/errors/state-transition.errors';
import { BundleEntity, BundleItemEntity } from '../../infrastructure/database/entities';
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
      // Bug (gefunden September 2026): die Item->BUNDLED-Transition allein
      // legt KEINE bundle_items-Zeile an — ohne diesen Insert bliebe die
      // Mitgliedschaft nirgends persistiert, GET /bundles/:id fände nie
      // Items, und ein späterer Bundle-Verkauf könnte sie nicht kaskadieren
      // (siehe transitionBundleWithManager).
      await manager.insert(
        BundleItemEntity,
        itemIds.map((itemId) => ({ bundleId: bundle.id, itemId })),
      );
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
      const bundle = await manager.findOneBy(BundleEntity, { id: bundleId });
      if (!bundle) throw new NotFoundException(`Bundle ${bundleId} not found`);

      // Bug-Fix (September 2026): bislang gab es hier KEINE Status-Prüfung
      // — Items ließen sich noch einem bereits LISTED/SOLD/CANCELLED Bundle
      // zuordnen, obwohl dessen Listing-Preis/-Beschreibung längst fixiert
      // war und ein späterer Bundle-Verkauf sie nie mitgenommen hätte.
      if (bundle.status !== 'NEW' && bundle.status !== 'READY') {
        throw new InvalidStateTransitionException(
          `Items can only be added while the bundle is NEW or READY (current: ${bundle.status})`,
          { bundleId, currentState: bundle.status },
        );
      }

      for (const itemId of itemIds) {
        await this.stateGuard.transitionItemWithManager(manager, itemId, {
          type: 'ASSIGN_TO_BUNDLE',
          actor,
        });
      }
      // Derselbe Bug wie in createBundleWithItems: ohne diesen Insert bleibt
      // die Mitgliedschaft nirgends persistiert (siehe dortiger Kommentar).
      await manager.insert(
        BundleItemEntity,
        itemIds.map((itemId) => ({ bundleId, itemId })),
      );
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
