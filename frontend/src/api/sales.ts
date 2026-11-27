import { api } from './client';

export type SalesPeriod = 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'all';

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

export interface SalesChannel {
  channel: string;
  salesCount: number;
  proceedsEur: number;
  feesAndShippingEur: number;
  purchaseCostEur: number;
  netProfitEur: number | null;
}

export interface Dac7Progress {
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

export interface SoldSaleItem {
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

export interface SalesOverview {
  period: SalesPeriod;
  from: string | null;
  to: string | null;
  year: number;
  kpis: SalesKpis;
  channels: SalesChannel[];
  dac7: Dac7Progress[];
  items: SoldSaleItem[];
}

export const salesApi = {
  overview: (period: SalesPeriod) => api.get<SalesOverview>(`/sales?period=${period}`),
  csv: (period: SalesPeriod) => api.download(`/sales/csv?period=${period}`),
};
