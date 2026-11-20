import { api } from './client';

export interface MarkdownSettings {
  enabled: boolean;
  percent: number;
  intervalDays: number;
  attentionAfterDays: number;
}

export interface EffectiveMarkdown {
  status: 'INHERIT' | 'ACTIVE' | 'PAUSED' | 'STOPPED';
  running: boolean;
  paused: boolean;
  stopped: boolean;
  percent: number;
  intervalDays: number;
  floorPrice: number | null;
  floorSource: 'SELLER' | 'SUGGESTION' | 'MISSING';
  suggestionFloor: number | null;
  currentPrice: number | null;
  nextPrice: number | null;
  reachedFloor: boolean;
  nextDueAt: string | null;
  daysOnline: number | null;
  lastError: string | null;
  waitingForConfirm: boolean;
  summary: string;
}

export interface MarkdownTask {
  id: string;
  itemId: string;
  itemTitle: string | null;
  projectionId: string | null;
  marketplaceId: string;
  marketplaceLabel: string;
  targetPrice: number;
  previousPrice: number;
  kind: 'MANUAL_PRICE' | 'EBAY_ERROR';
  message: string;
  detail: string | null;
  copyText: string;
  createdAt: string;
}

export interface PriceHistoryEntry {
  id: string;
  previousPrice: number;
  newPrice: number;
  note: string;
  source: 'AUTOMATIC' | 'MANUAL_CONFIRM' | 'FOLLOW_UP';
  marketplaceId: string | null;
  changedAt: string;
}

export interface ItemMarkdown {
  itemId: string;
  title: string | null;
  status: 'INHERIT' | 'ACTIVE' | 'PAUSED' | 'STOPPED';
  percent: number | null;
  intervalDays: number | null;
  floorPrice: number | null;
  effective: EffectiveMarkdown;
  tasks: MarkdownTask[];
  history: PriceHistoryEntry[];
}

export interface AttentionSuggestion {
  kind: 'LOWER_PRICE' | 'IMPROVE_PHOTOS' | 'RERUN_ANALYSIS';
  title: string;
  detail: string;
}

export interface AttentionCard {
  itemId: string;
  title: string | null;
  daysOnline: number;
  currentPrice: number;
  suggestions: AttentionSuggestion[];
}

export interface TaskActionResult {
  applied: boolean;
  message: string;
}

export interface ItemMarkdownInput {
  status: ItemMarkdown['status'];
  percent: number | null;
  intervalDays: number | null;
  floorPrice: number | null;
}

export const markdownApi = {
  settings: () => api.get<MarkdownSettings>('/account/markdown-settings'),
  saveSettings: (body: MarkdownSettings) => api.patch<MarkdownSettings>('/account/markdown-settings', body),
  forItem: (itemId: string) => api.get<ItemMarkdown>(`/items/${itemId}/markdown`),
  savePlan: (itemId: string, body: ItemMarkdownInput) =>
    api.patch<ItemMarkdown>(`/items/${itemId}/markdown`, body),
  attention: () => api.get<AttentionCard[]>('/markdown/attention'),
  tasks: () => api.get<MarkdownTask[]>('/markdown/tasks'),
  confirmTask: (id: string) => api.post<TaskActionResult>(`/markdown/tasks/${id}/confirm`),
  dismissTask: (id: string) => api.post<TaskActionResult>(`/markdown/tasks/${id}/dismiss`),
};
