/**
 * Zeiträume der Verkaufsübersicht. Kalender in Europe/Berlin.
 * Keine Periodenabgrenzung: der Verkaufstag entscheidet, nicht der Klick.
 */

import { berlinIsoDate } from './recent-weeks';

export const SALES_PERIODS = [
  'this_month',
  'last_month',
  'this_year',
  'last_year',
  'all',
] as const;

export type SalesPeriod = (typeof SALES_PERIODS)[number];

export interface SalesRange {
  from: string | null;
  to: string | null;
}

export function isSalesPeriod(value: string): value is SalesPeriod {
  return (SALES_PERIODS as readonly string[]).includes(value);
}

/** Leere Eingabe ist dieser Monat. Unbekannt liefert null. */
export function parseSalesPeriod(value: string | undefined): SalesPeriod | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') return 'this_month';
  return isSalesPeriod(trimmed) ? trimmed : null;
}

export function periodRange(period: SalesPeriod, now: Date): SalesRange {
  if (period === 'all') return { from: null, to: null };

  const today = berlinIsoDate(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  if (period === 'this_month') {
    return { from: monthStart(year, month), to: monthEnd(year, month) };
  }
  if (period === 'last_month') {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return { from: monthStart(prevYear, prevMonth), to: monthEnd(prevYear, prevMonth) };
  }
  if (period === 'this_year') {
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
}

export function inSalesPeriod(saleDate: string | null, range: SalesRange): boolean {
  if (range.from == null || range.to == null) return true;
  if (saleDate == null) return false;
  return saleDate >= range.from && saleDate <= range.to;
}

function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function monthEnd(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  const day = String(last.getUTCDate()).padStart(2, '0');
  return `${year}-${String(month).padStart(2, '0')}-${day}`;
}
