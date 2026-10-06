/**
 * Monatsauswertung (Feature-Plan 3.12). Reine Rechnung, keine DB.
 *
 * Ein Monat in Europe/Berlin: eingekauft, verkauft, Marge, plus die Zahl
 * der Angebote, die gerade online sind. Das ist ein Überblick für einen
 * Einzelverkäufer, keine Periodenabgrenzung und kein Steuerprogramm.
 */

import { roundMoney } from '../pricing/expected-margin';
import { berlinIsoDate } from '../sales/recent-weeks';

export interface MonthWindow {
  month: string;
  start: string;
  end: string;
}

export interface MonthPurchaseRow {
  purchasePriceEur: number | null;
}

export interface MonthSaleRow {
  proceedsEur: number | null;
  netProfitEur: number | null;
}

export interface MonthlySummary {
  month: string;
  monthStart: string;
  monthEnd: string;
  purchasedCount: number;
  purchasedEur: number | null;
  soldCount: number;
  soldEur: number | null;
  marginEur: number | null;
  onlineCount: number;
}

export function berlinMonth(now: Date): string {
  return berlinIsoDate(now).slice(0, 7);
}

/** `JJJJ-MM`, sonst null. Der letzte Tag kennt auch den Schaltmonat. */
export function parseMonth(value: string): MonthWindow | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const start = `${match[1]}-${match[2]}-01`;
  const last = new Date(Date.UTC(year, month, 0));
  const day = String(last.getUTCDate()).padStart(2, '0');
  return {
    month: `${match[1]}-${match[2]}`,
    start,
    end: `${match[1]}-${match[2]}-${day}`,
  };
}

/**
 * Leerer Monat ist 0 €, nicht „unbekannt“. Fehlt bei vorhandenen Einkäufen
 * oder Verkäufen der Betrag, bleibt die Summe leer. Eine echte Null-Marge
 * (Verkauf genau zum Einstand) bleibt 0.
 */
export function summarizeMonth(input: {
  window: MonthWindow;
  purchases: MonthPurchaseRow[];
  sales: MonthSaleRow[];
  onlineCount: number;
}): MonthlySummary {
  const purchased = sumKnown(
    input.purchases.map((row) => row.purchasePriceEur),
  );
  const sold = sumKnown(input.sales.map((row) => row.proceedsEur));
  const margin = sumKnown(input.sales.map((row) => row.netProfitEur));
  return {
    month: input.window.month,
    monthStart: input.window.start,
    monthEnd: input.window.end,
    purchasedCount: input.purchases.length,
    purchasedEur: amountOrEmpty(input.purchases.length, purchased),
    soldCount: input.sales.length,
    soldEur: amountOrEmpty(input.sales.length, sold),
    marginEur: amountOrEmpty(input.sales.length, margin),
    onlineCount: input.onlineCount,
  };
}

function sumKnown(values: Array<number | null>): {
  known: number;
  sum: number;
} {
  let known = 0;
  let sum = 0;
  for (const value of values) {
    if (value == null) continue;
    known += 1;
    sum += value;
  }
  return { known, sum: roundMoney(sum) };
}

function amountOrEmpty(
  count: number,
  summed: { known: number; sum: number },
): number | null {
  if (count === 0) return 0;
  if (summed.known === 0) return null;
  return summed.sum;
}
