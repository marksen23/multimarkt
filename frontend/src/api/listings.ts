import { api } from './client';
import type { SaleCloseoutDraft } from '../margin/sale-closeout';
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
  markSold: (projectionId: string, draft: SaleCloseoutDraft) =>
    api.post<{ outcome: string }>(`/listings/${projectionId}/mark-sold`, {
      reportedPrice: draft.proceedsEur,
      portal: draft.portal,
      feeEur: draft.feeEur,
      shippingEur: draft.shippingEur,
      paymentMethod: draft.paymentMethod,
    }),
};
