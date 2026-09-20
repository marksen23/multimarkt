import { createMachine } from 'xstate';

/**
 * Sale Event State Machine (Doc 02 §7, §8) — "epistemischer Prozess".
 *
 * Anders als Item/Listing/Bundle hat `sale_events` KEINE eigene
 * `status`-Spalte (Doc 01): der konzeptionelle Zustand wird aus `is_winner`
 * abgeleitet (NULL+Geschwister=1 → REPORTED, NULL+Geschwister>1 →
 * CONFLICTED, TRUE → HUMAN_SELECTED, FALSE → REJECTED). Diese Maschine
 * bleibt deshalb bewusst ein reiner Spezifikations-/Entscheidungsartefakt;
 * die tatsächliche, DB-transaktionale Auswertung mit Row-Locks (Doc 03 §9)
 * folgt in Schritt 4 zusammen mit der Webhook-Ingestion.
 */

export type SaleEventState =
  | 'REPORTED'
  | 'CONFLICTED'
  | 'HUMAN_SELECTED'
  | 'REJECTED';

export type SaleEventMachineEvent =
  | { type: 'REPORT'; siblingReportCount: number }
  | { type: 'HUMAN_SELECT' }
  | { type: 'REJECT' };

export const saleEventMachine = createMachine({
  id: 'saleEvent',
  initial: 'REPORTED',
  types: {} as { events: SaleEventMachineEvent },
  states: {
    REPORTED: {
      on: {
        REPORT: [
          {
            target: 'CONFLICTED',
            guard: ({ event }) => event.siblingReportCount > 1,
          },
          { target: 'REPORTED' },
        ],
      },
    },
    CONFLICTED: {
      on: {
        HUMAN_SELECT: { target: 'HUMAN_SELECTED' },
        REJECT: { target: 'REJECTED' },
      },
    },
    HUMAN_SELECTED: {},
    REJECTED: {},
  },
});

/** Reine Ableitungsfunktion aus dem persistierten `is_winner`-Feld. */
export function deriveSaleEventState(
  isWinner: boolean | null,
  siblingReportCount: number,
): SaleEventState {
  if (isWinner === true) return 'HUMAN_SELECTED';
  if (isWinner === false) return 'REJECTED';
  return siblingReportCount > 1 ? 'CONFLICTED' : 'REPORTED';
}
