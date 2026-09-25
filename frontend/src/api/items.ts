import { api } from './client';
import type {
  CanonicalListing,
  Item,
  ItemAttribute,
  ItemDetail,
  ItemListEntry,
  ItemLifecycleState,
  ListingChannel,
  PhotoQualityReport,
  PriceResearchResult,
  SaleEvent,
  TitleSuggestion,
} from './types';

export const itemsApi = {
  list: (status?: ItemLifecycleState) =>
    api.get<ItemListEntry[]>(status ? `/items?status=${status}` : '/items'),
  create: (title?: string) => api.post<Item>('/items', { title }),
  get: (id: string) => api.get<ItemDetail>(`/items/${id}`),
  analyze: (id: string, files: File[], onProgress?: (fraction: number) => void) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    return api.postForm<Item>(`/items/${id}/analyze`, form, onProgress);
  },
  priceResearch: (id: string) => api.get<PriceResearchResult>(`/items/${id}/price-research`),
  photoQuality: (id: string) => api.get<PhotoQualityReport>(`/items/${id}/photo-quality`),
  generateTitle: (id: string, channel: ListingChannel) =>
    api.get<TitleSuggestion>(`/items/${id}/generate-title?channel=${channel}`),
  updateTitle: (id: string, title: string) => api.patch<Item>(`/items/${id}/title`, { title }),
  generateDescription: (id: string, salesGoal?: string) =>
    api.get<{ descriptionText: string }>(
      `/items/${id}/generate-description${salesGoal ? `?salesGoal=${salesGoal}` : ''}`,
    ),
  optimizePhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.postForm<{ url: string | null }>(`/items/${id}/optimize-photo`, form);
  },
  confirmTruth: (id: string, condition: string) =>
    api.post<Item>(`/items/${id}/confirm-truth`, { condition }),
  discard: (id: string) => api.post<Item>(`/items/${id}/discard`),
  confirmAttribute: (id: string, key: string, value?: string) =>
    api.post<ItemAttribute>(`/items/${id}/attributes/${key}/confirm`, { value }),
  prepareListing: (id: string, sellingPrice: number, descriptionText?: string) =>
    api.post<CanonicalListing>(`/items/${id}/prepare-listing`, {
      sellingPrice,
      descriptionText,
    }),
  bundle: (id: string, title: string, itemIds: string[]) =>
    api.post(`/items/${id}/bundle`, { title, itemIds }),
  saleEvents: (id: string) => api.get<SaleEvent[]>(`/items/${id}/sale-events`),
  resolveConflict: (id: string, winningSaleEventId: string) =>
    api.post<Item>(`/items/${id}/resolve-conflict`, { winningSaleEventId }),
};
