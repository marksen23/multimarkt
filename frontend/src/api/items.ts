import { api } from './client';
import type {
  CanonicalListing,
  Item,
  ItemAttribute,
  ItemDetail,
  ItemListEntry,
  ItemLifecycleState,
  SaleEvent,
} from './types';

export const itemsApi = {
  list: (status?: ItemLifecycleState) =>
    api.get<ItemListEntry[]>(status ? `/items?status=${status}` : '/items'),
  create: (title?: string) => api.post<Item>('/items', { title }),
  get: (id: string) => api.get<ItemDetail>(`/items/${id}`),
  analyze: (id: string, imageUrls: string[]) =>
    api.post<Item>(`/items/${id}/analyze`, { imageUrls }),
  confirmTruth: (id: string, condition: string) =>
    api.post<Item>(`/items/${id}/confirm-truth`, { condition }),
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
