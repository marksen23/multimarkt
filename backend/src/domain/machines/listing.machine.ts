import { createMachine } from 'xstate';
import { ActorContext } from '../actor-context';

/**
 * Listing (Marketplace Projection) State Machine (Doc 02 §5, §9).
 *
 * Die Prozess-Substates aus Doc 02 §9 (API_CANCEL_REQUESTED,
 * CANCELLATION_ACTION_REQUIRED, USER_SENDS_CANCELLATION, ...) sind laut
 * Doc 03 §17 explizit KEINE persistenten DB-Enum-Werte, sondern BullMQ-
 * Job-States bzw. UI-Flow-Schritte innerhalb von CANCEL_PENDING — sie
 * tauchen deshalb hier bewusst nicht als eigene States auf.
 */

const isUser = (actor: ActorContext) => actor.type === 'USER';
const isUserOrSystem = (actor: ActorContext) =>
  actor.type === 'USER' || actor.type === 'SYSTEM';

export type ListingMachineEvent =
  | { type: 'MARK_READY'; actor: ActorContext }
  | { type: 'PUBLISH'; actor: ActorContext }
  | { type: 'PUBLISH_SUCCESS'; actor: ActorContext }
  | { type: 'SOLD_HERE'; actor: ActorContext }
  | { type: 'CANCEL_PENDING_TRIGGERED'; actor: ActorContext }
  | { type: 'CONFIRM_CANCELLATION'; actor: ActorContext };

export const listingMachine = createMachine({
  id: 'listing',
  initial: 'DRAFT',
  types: {} as { events: ListingMachineEvent },
  states: {
    DRAFT: {
      // Kein Human-Gate: "Config komplett" ist eine automatische Ableitung
      // aus vollständigen Pflichtfeldern (CapabilityCheckService, Schritt 4).
      on: { MARK_READY: { target: 'READY' } },
    },
    READY: {
      // Human-Gate (Doc 04 §9: "[Human-Gate] Triggert API-Publish oder
      // Format-Helper-Export").
      on: {
        PUBLISH: {
          target: 'PUBLISHING',
          guard: ({ event }) => isUser(event.actor),
        },
      },
    },
    PUBLISHING: {
      on: {
        // Verifizierte API-Antwort (SYSTEM) oder bestätigtes Copy-Paste
        // durch den Nutzer bei Formatierungshilfe-Plattformen (USER).
        PUBLISH_SUCCESS: {
          target: 'ONLINE',
          guard: ({ event }) => isUserOrSystem(event.actor),
        },
      },
    },
    ONLINE: {
      on: {
        SOLD_HERE: {
          target: 'SOLD',
          guard: ({ event }) => isUserOrSystem(event.actor),
        },
        // Deterministischer Seiteneffekt eines Siegerverkaufs auf einer
        // ANDEREN Plattform — kein Human-Gate (Doc 01 §12).
        CANCEL_PENDING_TRIGGERED: { target: 'CANCEL_PENDING' },
      },
    },
    CANCEL_PENDING: {
      // Doc 04 §13.3: Actor USER (Non-API) oder SYSTEM (verifizierte
      // API-Bestätigung) — niemals ein roher WEBHOOK-Call direkt (Doc 02 I3).
      on: {
        CONFIRM_CANCELLATION: {
          target: 'CANCELLED',
          guard: ({ event }) => isUserOrSystem(event.actor),
        },
      },
    },
    CANCELLED: {},
    SOLD: {},
  },
});
