/**
 * Verkaufsdatum für die Auswertung. Reine Prüfung, keine DB.
 *
 * Der Tag ist ein Kalendertag, nicht der Klickzeitpunkt. Leer heißt:
 * heute in Europe/Berlin. Ein Tag weiter ist erlaubt, damit eine Uhr
 * knapp nach Mitternacht nicht am Formular scheitert.
 */

import { addDays, berlinIsoDate } from './recent-weeks';

const EARLIEST = '2000-01-01';

export type SaleDateResult =
  | { ok: true; date: string }
  | { ok: false; message: string };

export function resolveSaleDate(
  value: string | null | undefined,
  now: Date,
): SaleDateResult {
  const today = berlinIsoDate(now);
  const latest = addDays(today, 1);
  const raw = value?.trim() ?? '';
  if (raw === '') return { ok: true, date: today };

  const iso = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !isRealCalendarDay(iso)) {
    return { ok: false, message: 'Das Verkaufsdatum muss ein gültiger Tag (JJJJ-MM-TT) sein.' };
  }
  if (iso < EARLIEST || iso > latest) {
    return { ok: false, message: 'Das Verkaufsdatum liegt außerhalb des zulässigen Bereichs.' };
  }
  return { ok: true, date: iso };
}

/** Mittag UTC liegt am selben Kalendertag in Europe/Berlin (UTC+1/+2). */
export function saleInstant(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00.000Z`);
}

function isRealCalendarDay(iso: string): boolean {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
