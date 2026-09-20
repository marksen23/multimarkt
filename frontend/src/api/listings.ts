import { api } from './client';
import type { MarketplaceProjectionSummary } from './types';

export const listingsApi = {
  create: (canonicalListingId: string, marketplaceId: string) =>
    api.post<MarketplaceProjectionSummary>('/listings', { canonicalListingId, marketplaceId }),
  capabilityCheck: (projectionId: string) =>
    api.post<{ ok: true; fallbackData: Record<string, string> }>(
      `/listings/${projectionId}/capability-check`,
    ),
  publish: (projectionId: string) =>
    api.post<MarketplaceProjectionSummary>(`/listings/${projectionId}/publish`),
  cancel: (projectionId: string) =>
    api.post<MarketplaceProjectionSummary>(`/listings/${projectionId}/cancel`),
  confirmCancellation: (projectionId: string) =>
    api.post<MarketplaceProjectionSummary>(`/listings/${projectionId}/confirm-cancellation`),
};
