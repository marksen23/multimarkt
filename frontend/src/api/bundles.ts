import { api } from './client';
import type {
  Bundle,
  BundleDetail,
  BundleListEntry,
  BundleSuggestionList,
  CanonicalListing,
} from './types';

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
  suggestions: () => api.get<BundleSuggestionList>('/bundles/suggestions'),
  acceptSuggestion: (fingerprint: string) =>
    api.post<Bundle>('/bundles/suggestions/accept', { fingerprint }),
  dismissSuggestion: (fingerprint: string) =>
    api.post<{ dismissed: true }>('/bundles/suggestions/dismiss', { fingerprint }),
};
