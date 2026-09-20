import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ActorContext } from '../../domain/actor-context';
import { InvalidStateTransitionException } from '../../domain/errors/state-transition.errors';
import {
  CanonicalListingEntity,
  ItemEntity,
  MarketplaceProjectionEntity,
  SaleEventEntity,
} from '../../infrastructure/database/entities';
import { StateGuardService } from '../state-guard/state-guard.service';

/**
 * `POST /items/:id/resolve-conflict` (Doc 04 §13.1) — der einzige Weg aus
 * `SALE_CONFLICT` heraus. Strikt Human-Gated (RESOLVE_CONFLICT_SOLD im
 * StateGuardService erzwingt bereits `actor.type === 'USER'`, hier zusätzlich
 * geprüft, um mit einer präzisen Fehlermeldung früh abzubrechen).
 *
 * Idempotenz (Doc 04 §13.1): ohne eigene Idempotency-Key-Tabelle (nicht Teil
 * des eingefrorenen Doc-01-Schemas) wird Idempotenz über den STATE selbst
 * angenähert — ist das Item bereits `SOLD`, antwortet ein erneuter Aufruf
 * mit dem aktuellen Zustand statt erneut Seiteneffekte auszulösen.
 */
@Injectable()
export class ConflictResolutionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stateGuard: StateGuardService,
  ) {}

  async resolve(
    itemId: string,
    winningSaleEventId: string,
    actor: ActorContext,
  ): Promise<ItemEntity> {
    return this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(ItemEntity, {
        where: { id: itemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException(`Item ${itemId} not found`);

      if (item.status === 'SOLD') {
        return item; // idempotenter Replay eines bereits abgeschlossenen Resolves.
      }
      if (item.status !== 'SALE_CONFLICT') {
        throw new InvalidStateTransitionException(
          `resolve-conflict requires item status SALE_CONFLICT (current: ${item.status})`,
          { itemId, currentState: item.status },
        );
      }

      const openEvents = await this.loadOpenEventsForItem(manager, itemId);
      const winner = openEvents.find((e) => e.id === winningSaleEventId);
      if (!winner) {
        throw new NotFoundException(
          `Sale event ${winningSaleEventId} is not an open conflicting report for item ${itemId}`,
        );
      }

      for (const event of openEvents) {
        const isWinner = event.id === winningSaleEventId;
        await manager.update(SaleEventEntity, { id: event.id }, { isWinner });
        await this.stateGuard.transitionProjectionWithManager(manager, event.projectionId, {
          type: isWinner ? 'SOLD_HERE' : 'CANCEL_PENDING_TRIGGERED',
          actor,
        });
      }

      return this.stateGuard.transitionItemWithManager(manager, itemId, {
        type: 'RESOLVE_CONFLICT_SOLD',
        actor,
      });
    });
  }

  private async loadOpenEventsForItem(
    manager: EntityManager,
    itemId: string,
  ): Promise<SaleEventEntity[]> {
    return manager
      .createQueryBuilder(SaleEventEntity, 'se')
      .innerJoin(MarketplaceProjectionEntity, 'p', 'p.id = se.projection_id')
      .innerJoin(CanonicalListingEntity, 'l', 'l.id = p.canonical_listing_id')
      .where('l.item_id = :itemId', { itemId })
      .andWhere('se.is_winner IS NULL')
      .getMany();
  }
}
