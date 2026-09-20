import { api } from './client';
import type { CanonicalListing, Item, ItemDetail } from './types';

export const itemsApi = {
  create: (title?: string) => api.post<Item>('/items', { title }),
  get: (id: string) => api.get<ItemDetail>(`/items/${id}`),
  analyze: (id: string, imageUrls: string[]) =>
    api.post<Item>(`/items/${id}/analyze`, { imageUrls }),
  confirmTruth: (id: string, condition: string) =>
    api.post<Item>(`/items/${id}/confirm-truth`, { condition }),
  prepareListing: (id: string, sellingPrice: number, descriptionText?: string) =>
    api.post<CanonicalListing>(`/items/${id}/prepare-listing`, {
      sellingPrice,
      descriptionText,
    }),
};
