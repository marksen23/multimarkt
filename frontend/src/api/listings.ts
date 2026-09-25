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
  confirmPublished: (projectionId: string) =>
    api.post<MarketplaceProjectionSummary>(`/listings/${projectionId}/confirm-published`),
  cancel: (projectionId: string) =>
    api.post<MarketplaceProjectionSummary>(`/listings/${projectionId}/cancel`),
  confirmCancellation: (projectionId: string) =>
    api.post<MarketplaceProjectionSummary>(`/listings/${projectionId}/confirm-cancellation`),
  markSold: (projectionId: string, reportedPrice: number) =>
    api.post<{ outcome: string }>(`/listings/${projectionId}/mark-sold`, { reportedPrice }),
};
