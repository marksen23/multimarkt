import { api } from './client';
import type { ItemLifecycleState } from './types';

export interface SalesWeek {
  weekStart: string;
  weekEnd: string;
  salesCount: number;
  netProfitEur: number | null;
}

export interface OpenSaleItem {
  id: string;
  title: string | null;
  status: ItemLifecycleState;
  purchasePriceEur: number | null;
  askingPriceEur: number | null;
}

export interface SoldSaleItem {
  id: string;
  title: string | null;
  soldAt: string | null;
  portal: string | null;
  proceedsEur: number | null;
  feeEur: number | null;
  shippingEur: number | null;
  paymentMethod: string | null;
  purchasePriceEur: number | null;
  netProfitEur: number | null;
}

export interface SalesOverview {
  weeks: SalesWeek[];
  openItems: OpenSaleItem[];
  soldItems: SoldSaleItem[];
}

export const salesApi = {
  overview: () => api.get<SalesOverview>('/sales'),
};
