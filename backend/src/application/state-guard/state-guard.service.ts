import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AnyStateMachine, createActor } from 'xstate';
import { ActorContext } from '../../domain/actor-context';
import {
  HumanGateBypassException,
  InvalidStateTransitionException,
  UnconfirmedConditionException,
} from '../../domain/errors/state-transition.errors';
import { BundleMachineEvent, bundleMachine } from '../../domain/machines/bundle.machine';
import { ItemMachineEvent, itemMachine } from '../../domain/machines/item.machine';
import { ListingMachineEvent, listingMachine } from '../../domain/machines/listing.machine';
import {
  BundleEntity,
  BundleItemEntity,
  CanonicalListingEntity,
  ItemAttributeEntity,
  ItemEntity,
  MarketplaceProjectionEntity,
} from '../../infrastructure/database/entities';

// Events, die Doc 02 §10 als Human-Gate markiert — nur Actor 'USER' darf sie
// auslösen. Diese Liste ist der einzige Ort, der die Matrix aus Doc 02 §10
// in eine harte, spezifische 403-Prüfung übersetzt; die XState-Guards in den
// Maschinen selbst sind die *strukturelle* Letztinstanz (defense in depth),
// aber ohne diese Vorprüfung würde ein Bypass-Versuch nur als generisches
// 409 statt als 403 sichtbar werden (siehe Doc 05 T04-1).
const ITEM_HUMAN_GATED_EVENTS = new Set<ItemMachineEvent['type']>([
  'CONFIRM_TRUTH',
  'ASSIGN_TO_BUNDLE',
  'START_LISTING',
  'RESOLVE_CONFLICT_SOLD',
  'RESOLVE_CONFLICT_CANCEL',
  'DISCARD',
]);

const LISTING_HUMAN_GATED_EVENTS = new Set<ListingMachineEvent['type']>(['PUBLISH']);

const BUNDLE_HUMAN_GATED_EVENTS = new Set<BundleMachineEvent['type']>([
  'ITEMS_ASSIGNED',
  'START_LISTING',
  'CANCEL',
]);

// Doc 02 Invariante I4: "aktiv" bedeutet ONLINE oder PUBLISHING.
const ACTIVE_PROJECTION_STATES = ['PUBLISHING', 'ONLINE'] as const;

/**
 * StateGuardService — die EINZIGE erlaubte Stelle, an der sich der `status`
 * eines Items, einer Marketplace Projection oder eines Bundles ändert
 * (Doc 03 §16: direkte `UPDATE ... SET status = ...`-Aufrufe außerhalb
 * dieses Service sind verboten und ein Code-Review-Blocker).
 *
 * Jede `*WithManager`-Methode geht davon aus, dass der Aufrufer bereits eine
 * Transaktion offen hat (z.B. eine mehrstufige Orchestrierung wie die
 * Sale-Conflict-Auswertung in Schritt 4, die Item-Lock + Sale-Event-Insert +
 * Transition atomar in EINER Transaktion braucht — Doc 03 §9). Die
 * parameterlosen `transitionX`-Methoden sind dünne Wrapper für den
 * Single-Call-Fall und öffnen ihre eigene Transaktion.
 *
 * Jede Transition läuft unter `SELECT ... FOR UPDATE` (Doc 03 §14 Rule 1)
 * und wird von der jeweiligen XState-Maschine als strukturell gültig
 * bestätigt, bevor sie persistiert wird. Zusätzliche, in Doc 02 §11
 * beschriebene Preconditions (Condition bestätigt, keine aktiven Listings)
 * werden explizit vor der Maschinen-Transition geprüft.
 */
@Injectable()
export class StateGuardService {
  constructor(private readonly dataSource: DataSource) {}

  async transitionItem(itemId: string, event: ItemMachineEvent): Promise<ItemEntity> {
    return this.dataSource.transaction((manager) =>
      this.transitionItemWithManager(manager, itemId, event),
    );
  }

  async transitionItemWithManager(
    manager: EntityManager,
    itemId: string,
    event: ItemMachineEvent,
  ): Promise<ItemEntity> {
    const item = await manager.findOne(ItemEntity, {
      where: { id: itemId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    this.assertHumanGate(ITEM_HUMAN_GATED_EVENTS, event, { itemId });
    await this.assertItemPreconditions(manager, item, event);

    const nextStatus = this.resolveTransition(itemMachine, item.status, event);
    if (nextStatus === item.status) {
      throw new InvalidStateTransitionException(
        `Transition '${event.type}' is not allowed from item state '${item.status}'`,
        { itemId, currentState: item.status, event: event.type },
      );
    }

    item.status = nextStatus as ItemEntity['status'];

    if (event.type === 'CONFIRM_TRUTH') {
      await this.upsertConfirmedCondition(manager, itemId, event.condition!);
      item.condition = event.condition!;
    }

    return manager.save(ItemEntity, item);
  }

  async transitionProjection(
    projectionId: string,
    event: ListingMachineEvent,
  ): Promise<MarketplaceProjectionEntity> {
    return this.dataSource.transaction((manager) =>
      this.transitionProjectionWithManager(manager, projectionId, event),
    );
  }

  async transitionProjectionWithManager(
    manager: EntityManager,
    projectionId: string,
    event: ListingMachineEvent,
  ): Promise<MarketplaceProjectionEntity> {
    const projection = await manager.findOne(MarketplaceProjectionEntity, {
      where: { id: projectionId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!projection) throw new NotFoundException(`Projection ${projectionId} not found`);

    this.assertHumanGate(LISTING_HUMAN_GATED_EVENTS, event, { projectionId });

    const nextStatus = this.resolveTransition(listingMachine, projection.status, event);
    if (nextStatus === projection.status) {
      throw new InvalidStateTransitionException(
        `Transition '${event.type}' is not allowed from listing state '${projection.status}'`,
        { projectionId, currentState: projection.status, event: event.type },
      );
    }

    projection.status = nextStatus as MarketplaceProjectionEntity['status'];
    return manager.save(MarketplaceProjectionEntity, projection);
  }

  async transitionBundle(bundleId: string, event: BundleMachineEvent): Promise<BundleEntity> {
    return this.dataSource.transaction((manager) =>
      this.transitionBundleWithManager(manager, bundleId, event),
    );
  }

  async transitionBundleWithManager(
    manager: EntityManager,
    bundleId: string,
    event: BundleMachineEvent,
  ): Promise<BundleEntity> {
    const bundle = await manager.findOne(BundleEntity, {
      where: { id: bundleId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!bundle) throw new NotFoundException(`Bundle ${bundleId} not found`);

    this.assertHumanGate(BUNDLE_HUMAN_GATED_EVENTS, event, { bundleId });

    const nextStatus = this.resolveTransition(bundleMachine, bundle.status, event);
    if (nextStatus === bundle.status) {
      throw new InvalidStateTransitionException(
        `Transition '${event.type}' is not allowed from bundle state '${bundle.status}'`,
        { bundleId, currentState: bundle.status, event: event.type },
      );
    }

    bundle.status = nextStatus as BundleEntity['status'];
    const saved = await manager.save(BundleEntity, bundle);

    // Doc 02 §6 Postcondition ("alle Kind-Items -> SOLD bei Bundle-Verkauf")
    // — bislang nirgends umgesetzt, obwohl bundle.machine.ts das explizit als
    // hierher delegiert dokumentiert. Ohne diese Kaskade blieben Items nach
    // einem Bundle-Verkauf/-Abbruch für immer in BUNDLED hängen.
    if (nextStatus === 'SOLD' || nextStatus === 'CANCELLED') {
      await this.cascadeBundleStatusToItems(manager, bundleId, nextStatus, event.actor);
    }

    return saved;
  }

  private async cascadeBundleStatusToItems(
    manager: EntityManager,
    bundleId: string,
    bundleStatus: 'SOLD' | 'CANCELLED',
    actor: ActorContext,
  ): Promise<void> {
    const memberships = await manager.find(BundleItemEntity, { where: { bundleId } });
    const cascadeEvent = bundleStatus === 'SOLD' ? 'BUNDLE_SOLD' : 'BUNDLE_CANCELLED';
    for (const membership of memberships) {
      const item = await manager.findOne(ItemEntity, {
        where: { id: membership.itemId },
        lock: { mode: 'pessimistic_write' },
      });
      // Nur BUNDLED-Items kaskadieren — ein Item, das (aus welchem Grund
      // auch immer) nicht mehr BUNDLED ist, wird nicht rückwirkend
      // überschrieben (die Maschine würde die Transition ohnehin ablehnen).
      if (item && item.status === 'BUNDLED') {
        item.status = this.resolveTransition(itemMachine, item.status, {
          type: cascadeEvent,
          actor,
        }) as ItemEntity['status'];
        await manager.save(ItemEntity, item);
      }
    }
  }

  /**
   * Führt EIN Event gegen die per DB-Status rehydrierte Maschine aus und
   * gibt den resultierenden State-Value zurück. Bleibt der Wert unverändert,
   * war das Event aus diesem Zustand nicht erlaubt (kein Handler ODER Guard
   * hat abgelehnt) — das ist bewusst ununterscheidbar von außen, XState ist
   * hier die alleinige Autorität für "strukturell erlaubt oder nicht".
   */
  private resolveTransition<TEvent extends { type: string }>(
    machine: AnyStateMachine,
    currentStatus: string,
    event: TEvent,
  ): string {
    const resolved = machine.resolveState({ value: currentStatus, context: {} });
    const actor = createActor(machine, { snapshot: resolved });
    actor.start();
    actor.send(event as never);
    const snapshot = actor.getSnapshot();
    actor.stop();
    return String(snapshot.value);
  }

  private assertHumanGate<TType extends string>(
    gatedEvents: Set<TType>,
    event: { type: TType; actor: { type: string } },
    context: Record<string, unknown>,
  ): void {
    if (gatedEvents.has(event.type) && event.actor.type !== 'USER') {
      throw new HumanGateBypassException(
        `Event '${event.type}' requires an authenticated USER actor (Human-Gate, Doc 02 §10)`,
        { ...context, event: event.type, actor: event.actor.type },
      );
    }
  }

  private async assertItemPreconditions(
    manager: EntityManager,
    item: ItemEntity,
    event: ItemMachineEvent,
  ): Promise<void> {
    if (event.type === 'CONFIRM_TRUTH') {
      // Doc 03 §4: fehlt eine explizit vom Nutzer bestätigte Condition in
      // der Payload, wird READY hart blockiert (422) — unabhängig davon,
      // ob der Actor korrekt USER ist.
      if (!event.condition) {
        throw new UnconfirmedConditionException(
          'condition must be explicitly provided and confirmed by the user',
          { itemId: item.id },
        );
      }
    }

    if (event.type === 'ASSIGN_TO_BUNDLE') {
      // Doc 02 §11 Precondition für BUNDLED: keine aktiven Listings.
      const activeCount = await manager
        .createQueryBuilder(MarketplaceProjectionEntity, 'projection')
        .innerJoin(CanonicalListingEntity, 'listing', 'listing.id = projection.canonical_listing_id')
        .where('listing.item_id = :itemId', { itemId: item.id })
        .andWhere('projection.status IN (:...activeStates)', {
          activeStates: ACTIVE_PROJECTION_STATES,
        })
        .getCount();

      if (activeCount > 0) {
        throw new InvalidStateTransitionException(
          `Item has ${activeCount} active marketplace listing(s); cannot be bundled`,
          { itemId: item.id, activeCount },
        );
      }
    }
  }

  private async upsertConfirmedCondition(
    manager: EntityManager,
    itemId: string,
    condition: string,
  ): Promise<void> {
    await manager.upsert(
      ItemAttributeEntity,
      {
        itemId,
        attributeKey: 'condition',
        attributeValue: condition,
        truthState: 'USER_CONFIRMED',
        source: 'USER_INPUT',
      },
      ['itemId', 'attributeKey'],
    );
  }
}
