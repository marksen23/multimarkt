import { createMachine } from 'xstate';
import { ActorContext } from '../actor-context';

/**
 * Bundle State Machine (Doc 02 §6). Aggregiert den Lifecycle seiner
 * gebündelten Items — Postcondition (alle Kind-Items → SOLD bei
 * Bundle-Verkauf) wird im StateGuardService umgesetzt, nicht hier.
 *
 * `CANCEL` ist in Doc 02 §6 nicht wörtlich beschrieben, aber
 * `bundle_lifecycle_state` (Doc 01) definiert `CANCELLED` als gültigen
 * Endzustand. Bewusste, konservative Auslegung: das Aufgeben eines Bundles
 * ist wie jede andere Dispositionsentscheidung strikt Human-Gated.
 */

const isUser = (actor: ActorContext) => actor.type === 'USER';
const isUserOrSystem = (actor: ActorContext) =>
  actor.type === 'USER' || actor.type === 'SYSTEM';

export type BundleMachineEvent =
  | { type: 'ITEMS_ASSIGNED'; actor: ActorContext }
  | { type: 'START_LISTING'; actor: ActorContext }
  | { type: 'SALE_CONFIRMED'; actor: ActorContext }
  | { type: 'CANCEL'; actor: ActorContext };

export const bundleMachine = createMachine({
  id: 'bundle',
  initial: 'NEW',
  types: {} as { events: BundleMachineEvent },
  states: {
    NEW: {
      on: {
        ITEMS_ASSIGNED: {
          target: 'READY',
          guard: ({ event }) => isUser(event.actor),
        },
        CANCEL: { target: 'CANCELLED', guard: ({ event }) => isUser(event.actor) },
      },
    },
    READY: {
      on: {
        START_LISTING: {
          target: 'LISTED',
          guard: ({ event }) => isUser(event.actor),
        },
        CANCEL: { target: 'CANCELLED', guard: ({ event }) => isUser(event.actor) },
      },
    },
    LISTED: {
      on: {
        SALE_CONFIRMED: {
          target: 'SOLD',
          guard: ({ event }) => isUserOrSystem(event.actor),
        },
        CANCEL: { target: 'CANCELLED', guard: ({ event }) => isUser(event.actor) },
      },
    },
    SOLD: {},
    CANCELLED: {},
  },
});
