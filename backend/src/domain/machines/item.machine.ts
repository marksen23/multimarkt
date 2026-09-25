import { createMachine } from 'xstate';
import { ActorContext } from '../actor-context';

/**
 * Item State Machine (Doc 02 §4, §8, Human-Gate-Matrix §10).
 *
 * Bewusstes Design: diese Maschine ist die alleinige Quelle der Wahrheit für
 * "welcher (Zustand, Event)-Übergang ist strukturell erlaubt UND welcher
 * Actor darf ihn auslösen" (Human-Gate). Zusätzliche, DB-abhängige
 * Preconditions (z.B. "Item hat keine aktiven LISTED Projections" für
 * BUNDLED, Doc 02 §11) werden bewusst NICHT hier, sondern im
 * StateGuardService geprüft — Guards hier bleiben rein synchron und hängen
 * ausschließlich vom mitgesendeten Actor ab.
 */

const isUser = (actor: ActorContext) => actor.type === 'USER';
const isUserOrSystem = (actor: ActorContext) =>
  actor.type === 'USER' || actor.type === 'SYSTEM';

export type ItemMachineEvent =
  | { type: 'UPLOAD_PHOTO'; actor: ActorContext }
  | { type: 'AI_ANALYSIS_COMPLETE'; actor: ActorContext }
  | { type: 'CONFIRM_TRUTH'; actor: ActorContext; condition?: string }
  | { type: 'ASSIGN_TO_BUNDLE'; actor: ActorContext }
  | { type: 'START_LISTING'; actor: ActorContext }
  | { type: 'SALE_CONFIRMED_SINGLE'; actor: ActorContext }
  | { type: 'SALE_CONFLICT_DETECTED'; actor: ActorContext }
  | { type: 'RESOLVE_CONFLICT_SOLD'; actor: ActorContext }
  | { type: 'RESOLVE_CONFLICT_CANCEL'; actor: ActorContext }
  | { type: 'ARCHIVE'; actor: ActorContext }
  | { type: 'DISCARD'; actor: ActorContext };

export const itemMachine = createMachine({
  id: 'item',
  initial: 'NEW',
  types: {} as { events: ItemMachineEvent },
  states: {
    NEW: {
      on: {
        UPLOAD_PHOTO: { target: 'ANALYZING' },
        DISCARD: { target: 'CANCELLED', guard: ({ event }) => isUser(event.actor) },
      },
    },
    ANALYZING: {
      on: {
        AI_ANALYSIS_COMPLETE: { target: 'REVIEW_REQUIRED' },
        DISCARD: { target: 'CANCELLED', guard: ({ event }) => isUser(event.actor) },
      },
    },
    REVIEW_REQUIRED: {
      // Human-Gate: ProductTruth-Bestätigung (Doc 02 §10)
      on: {
        CONFIRM_TRUTH: {
          target: 'READY',
          guard: ({ event }) => isUser(event.actor),
        },
        DISCARD: { target: 'CANCELLED', guard: ({ event }) => isUser(event.actor) },
      },
    },
    READY: {
      // Human-Gate: Disposition-Entscheidung (BUNDLED) / Publish-Intent (LISTED)
      on: {
        ASSIGN_TO_BUNDLE: {
          target: 'BUNDLED',
          guard: ({ event }) => isUser(event.actor),
        },
        START_LISTING: {
          target: 'LISTED',
          guard: ({ event }) => isUser(event.actor),
        },
        DISCARD: { target: 'CANCELLED', guard: ({ event }) => isUser(event.actor) },
      },
    },
    BUNDLED: {
      // Terminal innerhalb der Item-Maschine, solange das Bundle existiert
      // (Doc 02 §12 Postcondition: ProductTruth-Manipulation untersagt).
    },
    LISTED: {
      on: {
        // "Bedingt" automatisch (Doc 02 §10): SYSTEM bei eindeutigem
        // Einzelverkauf, oder USER bei manueller Bestätigung.
        SALE_CONFIRMED_SINGLE: {
          target: 'SOLD',
          guard: ({ event }) => isUserOrSystem(event.actor),
        },
        // Deterministischer Aggregat-Schutz — kein Human-Gate (Doc 02 §10).
        SALE_CONFLICT_DETECTED: { target: 'SALE_CONFLICT' },
      },
    },
    SALE_CONFLICT: {
      // Strikt Human-Gate (Doc 02 Invariante I2) — niemals per Webhook/Job.
      on: {
        RESOLVE_CONFLICT_SOLD: {
          target: 'SOLD',
          guard: ({ event }) => isUser(event.actor),
        },
        RESOLVE_CONFLICT_CANCEL: {
          target: 'CANCELLED',
          guard: ({ event }) => isUser(event.actor),
        },
      },
    },
    SOLD: {
      on: { ARCHIVE: { target: 'ARCHIVED' } },
    },
    ARCHIVED: {},
    CANCELLED: {},
  },
});
