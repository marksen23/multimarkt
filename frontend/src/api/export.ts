import { api } from './client';

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
  currentMonth: string;
}

export const exportApi = {
  month: (month?: string) =>
    api.get<MonthlySummary>(
      month ? `/export/month?month=${encodeURIComponent(month)}` : '/export/month',
    ),
  download: () => api.download('/export/download'),
};
