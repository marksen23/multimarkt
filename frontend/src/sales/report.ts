import { formatEuro } from '../lib/format';

export const SALES_PERIODS = [
  { id: 'this_month', label: 'Dieser Monat' },
  { id: 'last_month', label: 'Letzter Monat' },
  { id: 'this_year', label: 'Dieses Jahr' },
  { id: 'last_year', label: 'Letztes Jahr' },
  { id: 'all', label: 'Alle' },
] as const;

export type SalesPeriodId = (typeof SALES_PERIODS)[number]['id'];

export interface Dac7LineInput {
  channel: string;
  salesCount: number;
  proceedsEur: number;
  salesThreshold: number;
  proceedsThresholdEur: number;
  thresholdReached: boolean;
}

export function dac7Line(row: Dac7LineInput): string {
  const sales = `${row.salesCount} von ${row.salesThreshold} Verkäufen`;
  const money = `${formatEuro(row.proceedsEur, 2)} von ${formatEuro(row.proceedsThresholdEur, 0)}`;
  const reached = row.thresholdReached ? ' Zähler erreicht.' : '';
  return `${row.channel}: ${sales} · ${money}.${reached}`;
}

export function profitHint(kpis: {
  salesCount: number;
  purchaseMissingCount: number;
  netProfitEur: number | null;
}): string | null {
  if (kpis.salesCount === 0) return null;
  if (kpis.purchaseMissingCount === 0) {
    return 'Gewinn = Erlös − Gebühren − Versand − Einkauf.';
  }
  if (kpis.netProfitEur == null) {
    return 'Ohne Einkaufspreis gibt es keinen Gewinn. Gebühren und Versand stehen trotzdem in der Liste.';
  }
  const count = kpis.purchaseMissingCount;
  const word = count === 1 ? 'Verkauf' : 'Verkäufe';
  return `Bei ${count} ${word} fehlt der Einkaufspreis. Die zählen nicht im Gewinn.`;
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

function csvCell(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
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

export interface CsvSaleRow {
  id: string;
  title: string | null;
  saleDate: string | null;
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

/** UTF-8 mit BOM, Semikolon, Dezimalkomma, CRLF. Dieselbe Spaltenfolge wie GET /api/sales/csv. */
export function buildSalesCsv(rows: CsvSaleRow[]): string {
  const lines = [CSV_COLUMNS.join(';')];
  for (const row of rows) {
    const profit =
      row.netProfitEur != null
        ? row.netProfitEur
        : row.purchasePriceEur != null && row.proceedsEur != null
          ? Math.round(
              (row.proceedsEur - (row.feeEur ?? 0) - (row.shippingEur ?? 0) - row.purchasePriceEur) * 100,
            ) / 100
          : null;
    lines.push(
      [
        formatCsvDate(row.saleDate),
        csvCell(row.title ?? ''),
        csvCell(row.channel),
        formatCsvAmount(row.proceedsEur),
        formatCsvAmount(row.feeEur),
        formatCsvAmount(row.shippingEur),
        formatCsvAmount(row.purchasePriceEur),
        formatCsvAmount(profit),
        csvCell(row.buyer ?? ''),
        csvCell(row.notes ?? ''),
        csvCell(row.paymentMethod ?? ''),
        csvCell(row.id),
      ].join(';'),
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function salesCsvFilename(period: string, from: string | null, to: string | null): string {
  if (period === 'all' || from == null || to == null) return 'verkaeufe-alle.csv';
  return `verkaeufe-${from}_${to}.csv`;
}
