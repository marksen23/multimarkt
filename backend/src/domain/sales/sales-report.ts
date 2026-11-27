/**
 * Verkäufe & Gewinn. Reine Rechnung über bereits erfasste Abschlüsse.
 *
 * Gewinn ist der gespeicherte Nettogewinn (Erlös − Gebühren − Versand −
 * Einkauf zum Zeitpunkt des Abschlusses). Fehlt der Einkauf, gibt es für
 * diese Zeile keinen Gewinn — die übrigen Beträge bleiben in den Summen.
 * Verkaufsdauer ist der Kalendertagabstand von der Erfassung bis zum
 * Verkaufstag, mindestens 0.
 *
 * DAC7-Zähler: 30 Verkäufe oder 2.000 € Erlös je Kanal im Kalenderjahr.
 * Das ist ein Hinweis aus den eigenen Zahlen, keine Steuerberatung.
 */

import { roundMoney } from '../pricing/expected-margin';

export const DAC7_SALES_THRESHOLD = 30;
export const DAC7_PROCEEDS_THRESHOLD_EUR = 2000;

const CHANNEL_ORDER = ['eBay', 'Kleinanzeigen', 'Vinted', 'Facebook', 'Sonstiges', 'Ohne Kanal'];

const CANONICAL_CHANNEL: Record<string, string> = {
  ebay: 'eBay',
  'ebay.de': 'eBay',
  kleinanzeigen: 'Kleinanzeigen',
  'kleinanzeigen.de': 'Kleinanzeigen',
  vinted: 'Vinted',
  facebook: 'Facebook',
  'facebook marketplace': 'Facebook',
  sonstiges: 'Sonstiges',
  sonstige: 'Sonstiges',
};

export interface SaleLedgerRow {
  id: string;
  title: string | null;
  saleDate: string | null;
  createdOn: string | null;
  channel: string;
  proceedsEur: number | null;
  feeEur: number | null;
  shippingEur: number | null;
  purchasePriceEur: number | null;
  netProfitEur: number | null;
  buyer: string | null;
  notes: string | null;
  paymentMethod: string | null;
}

export interface SalesKpis {
  salesCount: number;
  proceedsEur: number;
  proceedsMissingCount: number;
  feesAndShippingEur: number;
  purchaseCostEur: number;
  purchaseRecordedCount: number;
  purchaseMissingCount: number;
  netProfitEur: number | null;
  averageDaysToSale: number | null;
  daysToSaleCount: number;
}

export interface ChannelBreakdown {
  channel: string;
  salesCount: number;
  proceedsEur: number;
  feesAndShippingEur: number;
  purchaseCostEur: number;
  netProfitEur: number | null;
}

export interface Dac7PlatformProgress {
  channel: string;
  year: number;
  salesCount: number;
  proceedsEur: number;
  salesThreshold: number;
  proceedsThresholdEur: number;
  salesReached: boolean;
  proceedsReached: boolean;
  thresholdReached: boolean;
}

export function canonicalChannel(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return 'Ohne Kanal';
  return CANONICAL_CHANNEL[trimmed.toLocaleLowerCase('de-DE')] ?? trimmed;
}

export function calendarDaysBetween(startIso: string, endIso: string): number {
  const start = Date.parse(`${startIso}T00:00:00Z`);
  const end = Date.parse(`${endIso}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

export function rowProfitEur(row: SaleLedgerRow): number | null {
  if (row.netProfitEur != null) return roundMoney(row.netProfitEur);
  if (row.purchasePriceEur == null || row.proceedsEur == null) return null;
  return roundMoney(
    roundMoney(row.proceedsEur) -
      roundMoney(row.feeEur ?? 0) -
      roundMoney(row.shippingEur ?? 0) -
      roundMoney(row.purchasePriceEur),
  );
}

export function feesAndShippingEur(feeEur: number | null, shippingEur: number | null): number {
  return roundMoney(roundMoney(feeEur ?? 0) + roundMoney(shippingEur ?? 0));
}

export function summarizeSales(rows: SaleLedgerRow[]): {
  kpis: SalesKpis;
  channels: ChannelBreakdown[];
} {
  const byChannel = new Map<string, SaleLedgerRow[]>();
  for (const row of rows) {
    const list = byChannel.get(row.channel) ?? [];
    list.push(row);
    byChannel.set(row.channel, list);
  }

  return {
    kpis: summarizeGroup(rows),
    channels: [...byChannel.entries()]
      .sort((a, b) => compareChannels(a[0], b[0]))
      .map(([channel, group]) => ({ channel, ...summarizeGroup(group) }))
      .map((group) => ({
        channel: group.channel,
        salesCount: group.salesCount,
        proceedsEur: group.proceedsEur,
        feesAndShippingEur: group.feesAndShippingEur,
        purchaseCostEur: group.purchaseCostEur,
        netProfitEur: group.netProfitEur,
      })),
  };
}

export function dac7Progress(rows: SaleLedgerRow[], year: number): Dac7PlatformProgress[] {
  const prefix = `${year}-`;
  const inYear = rows.filter((row) => row.saleDate != null && row.saleDate.startsWith(prefix));
  const { channels } = summarizeSales(inYear);
  return channels.map((channel) => {
    const salesReached = channel.salesCount >= DAC7_SALES_THRESHOLD;
    const proceedsReached = channel.proceedsEur >= DAC7_PROCEEDS_THRESHOLD_EUR;
    return {
      channel: channel.channel,
      year,
      salesCount: channel.salesCount,
      proceedsEur: channel.proceedsEur,
      salesThreshold: DAC7_SALES_THRESHOLD,
      proceedsThresholdEur: DAC7_PROCEEDS_THRESHOLD_EUR,
      salesReached,
      proceedsReached,
      thresholdReached: salesReached || proceedsReached,
    };
  });
}

const CSV_COLUMNS = [
  'Datum',
  'Artikel',
  'Kanal',
  'Verkaufspreis EUR',
  'Gebühren EUR',
  'Versand EUR',
  'Einkauf EUR',
  'Gewinn EUR',
  'Käufer',
  'Notiz',
  'Zahlungsweg',
  'Referenz',
];

/** UTF-8 mit BOM, Semikolon, Dezimalkomma, CRLF — öffnet in deutschem Excel. */
export function buildSalesCsv(rows: SaleLedgerRow[]): string {
  const lines = [CSV_COLUMNS.join(';')];
  for (const row of rows) {
    lines.push(
      [
        formatCsvDate(row.saleDate),
        csvCell(row.title ?? ''),
        csvCell(row.channel),
        formatCsvAmount(row.proceedsEur),
        formatCsvAmount(row.feeEur),
        formatCsvAmount(row.shippingEur),
        formatCsvAmount(row.purchasePriceEur),
        formatCsvAmount(rowProfitEur(row)),
        csvCell(row.buyer ?? ''),
        csvCell(row.notes ?? ''),
        csvCell(row.paymentMethod ?? ''),
        csvCell(row.id),
      ].join(';'),
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function formatCsvAmount(value: number | null): string {
  if (value == null) return '';
  const negative = value < 0;
  const cents = Math.round(Math.abs(value) * 100);
  const euros = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${euros},${rest}`;
}

export function formatCsvDate(iso: string | null): string {
  if (!iso) return '';
  const [year, month, day] = iso.slice(0, 10).split('-');
  if (!year || !month || !day) return '';
  return `${day}.${month}.${year}`;
}

export function salesCsvFilename(
  period: string,
  range: { from: string | null; to: string | null },
): string {
  if (period === 'all' || range.from == null || range.to == null) return 'verkaeufe-alle.csv';
  return `verkaeufe-${range.from}_${range.to}.csv`;
}

function summarizeGroup(rows: SaleLedgerRow[]): SalesKpis {
  let proceedsCents = 0;
  let proceedsMissingCount = 0;
  let feesCents = 0;
  let purchaseCents = 0;
  let purchaseRecordedCount = 0;
  let purchaseMissingCount = 0;
  let profitCents = 0;
  let profitCount = 0;
  let daysSum = 0;
  let daysToSaleCount = 0;

  for (const row of rows) {
    if (row.proceedsEur == null) proceedsMissingCount += 1;
    else proceedsCents += toCents(row.proceedsEur);
    feesCents += toCents(feesAndShippingEur(row.feeEur, row.shippingEur));
    if (row.purchasePriceEur == null) purchaseMissingCount += 1;
    else {
      purchaseRecordedCount += 1;
      purchaseCents += toCents(row.purchasePriceEur);
    }
    const profit = rowProfitEur(row);
    if (profit != null) {
      profitCount += 1;
      profitCents += toCents(profit);
    }
    if (row.saleDate && row.createdOn) {
      daysSum += Math.max(0, calendarDaysBetween(row.createdOn, row.saleDate));
      daysToSaleCount += 1;
    }
  }

  return {
    salesCount: rows.length,
    proceedsEur: fromCents(proceedsCents),
    proceedsMissingCount,
    feesAndShippingEur: fromCents(feesCents),
    purchaseCostEur: fromCents(purchaseCents),
    purchaseRecordedCount,
    purchaseMissingCount,
    netProfitEur: profitCount > 0 ? fromCents(profitCents) : rows.length === 0 ? 0 : null,
    averageDaysToSale:
      daysToSaleCount > 0 ? Math.round((daysSum / daysToSaleCount) * 10) / 10 : null,
    daysToSaleCount,
  };
}

function compareChannels(a: string, b: string): number {
  const rankA = channelRank(a);
  const rankB = channelRank(b);
  if (rankA !== rankB) return rankA - rankB;
  return a.localeCompare(b, 'de');
}

function channelRank(name: string): number {
  const index = CHANNEL_ORDER.indexOf(name);
  return index === -1 ? CHANNEL_ORDER.length : index;
}

function toCents(value: number): number {
  return Math.round(roundMoney(value) * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
}

function csvCell(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
