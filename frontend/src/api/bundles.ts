import { api } from './client';
import type { Bundle, BundleDetail, BundleListEntry, CanonicalListing } from './types';

export const bundlesApi = {
  list: () => api.get<BundleListEntry[]>('/bundles'),
  get: (id: string) => api.get<BundleDetail>(`/bundles/${id}`),
  create: (title: string, description?: string) =>
    api.post<Bundle>('/bundles', { title, description }),
  addItems: (id: string, itemIds: string[]) =>
    api.post<Bundle>(`/bundles/${id}/items`, { itemIds }),
  prepareListing: (id: string, sellingPrice: number, descriptionText: string) =>
    api.post<CanonicalListing>(`/bundles/${id}/prepare-listing`, {
      sellingPrice,
      descriptionText,
    }),
};
