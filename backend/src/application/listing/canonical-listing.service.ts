import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../domain/actor-context';
import { InvalidStateTransitionException } from '../../domain/errors/state-transition.errors';
import {
  BundleEntity,
  CanonicalListingEntity,
  ItemEntity,
} from '../../infrastructure/database/entities';
import { StateGuardService } from '../state-guard/state-guard.service';

/**
 * `POST /items/:id/prepare-listing` / `POST /bundles/:id/prepare-listing`
 * (Doc 04 §7/§10): leitet das Canonical Listing ab (Doc 01 §3, Doc 04 "Product
 * → Listing"). Doc 04 §20 listet dafür keinen eigenen Item-Zielzustand, aber
 * Doc 02 §4 kennt `READY --(Listing Start)--> LISTED` — dieser Service ist
 * der Moment, an dem der Nutzer sich verbindlich zum Verkauf entscheidet,
 * daher wird hier genau diese Transition ausgelöst (Human-Gate).
 */
@Injectable()
export class CanonicalListingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stateGuard: StateGuardService,
  ) {}

  async prepareForItem(
    userId: string,
    itemId: string,
    sellingPrice: number,
    descriptionText: string | undefined,
    actor: ActorContext,
  ): Promise<CanonicalListingEntity> {
    return this.dataSource.transaction(async (manager) => {
      const item = await manager.findOneBy(ItemEntity, { id: itemId });
      if (!item) throw new NotFoundException(`Item ${itemId} not found`);

      if (item.status !== 'READY') {
        throw new InvalidStateTransitionException(
          `Item must be READY to prepare a listing (current: ${item.status})`,
          { itemId, currentState: item.status },
        );
      }

      const listing = await manager.save(CanonicalListingEntity, {
        userId,
        itemId,
        bundleId: null,
        sellingPrice,
        descriptionText: descriptionText ?? this.defaultDescription(item.title, item.condition),
      });

      await this.stateGuard.transitionItemWithManager(manager, itemId, {
        type: 'START_LISTING',
        actor,
      });

      return listing;
    });
  }

  async prepareForBundle(
    userId: string,
    bundleId: string,
    sellingPrice: number,
    descriptionText: string,
    actor: ActorContext,
  ): Promise<CanonicalListingEntity> {
    return this.dataSource.transaction(async (manager) => {
      const bundle = await manager.findOneBy(BundleEntity, { id: bundleId });
      if (!bundle) throw new NotFoundException(`Bundle ${bundleId} not found`);

      if (bundle.status !== 'READY') {
        throw new InvalidStateTransitionException(
          `Bundle must be READY to prepare a listing (current: ${bundle.status})`,
          { bundleId, currentState: bundle.status },
        );
      }

      const listing = await manager.save(CanonicalListingEntity, {
        userId,
        itemId: null,
        bundleId,
        sellingPrice,
        descriptionText,
      });

      await this.stateGuard.transitionBundleWithManager(manager, bundleId, {
        type: 'START_LISTING',
        actor,
      });

      return listing;
    });
  }

  private defaultDescription(title: string | null, condition: string | null): string {
    return `${title ?? 'Artikel'} — Zustand: ${condition ?? 'unbekannt'}`;
  }
}
