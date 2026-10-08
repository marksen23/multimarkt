/**
 * Fenster für die Verkaufsliste (Feature-Plan 3.4). Kalenderwochen in
 * Europe/Berlin, Montag bis Sonntag. Keine Buchhaltung: nur die letzten
 * Wochen, die ein Einzelverkäufer überblickt.
 */

export const RECENT_WEEK_COUNT = 8;
const BERLIN = 'Europe/Berlin';

export interface WeekProfitInput {
  salesCount: number;
  profitCount: number;
  netProfitEur: number;
}

export interface WeekRow {
  weekStart: string;
  weekEnd: string;
  salesCount: number;
  netProfitEur: number | null;
}

export function berlinIsoDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function mondayOnOrBefore(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (utc.getUTCDay() + 6) % 7;
  return addDays(isoDate, -daysSinceMonday);
}

/** Älteste Woche zuerst, aktuelle Woche zuletzt. */
export function recentWeekStarts(now: Date, count = RECENT_WEEK_COUNT): string[] {
  const thisMonday = mondayOnOrBefore(berlinIsoDate(now));
  const starts: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    starts.push(addDays(thisMonday, -7 * i));
  }
  return starts;
}

/** Neueste Woche zuerst. Fehlende Wochen bleiben als leere Zeile sichtbar. */
export function buildWeekRows(
  weekStartsOldestFirst: string[],
  byWeek: Map<string, WeekProfitInput>,
): WeekRow[] {
  return [...weekStartsOldestFirst].reverse().map((weekStart) => {
    const row = byWeek.get(weekStart);
    const profitCount = row?.profitCount ?? 0;
    return {
      weekStart,
      weekEnd: addDays(weekStart, 6),
      salesCount: row?.salesCount ?? 0,
      netProfitEur: profitCount > 0 && row ? row.netProfitEur : null,
    };
  });
}
