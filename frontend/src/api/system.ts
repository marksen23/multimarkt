import { api } from './client';
import type { EbaySelection, EbaySetupView, IntegrationStatus } from './types';

export interface EbayLocationInput {
  name: string;
  street: string;
  postalCode: string;
  city: string;
}

export const systemApi = {
  integrations: () => api.get<IntegrationStatus>('/system/integrations'),
  ebay: () => api.get<EbaySetupView>('/system/ebay'),
  connectEbay: () => api.post<{ authorizeUrl: string }>('/system/ebay/connect'),
  disconnectEbay: () => api.post<EbaySetupView>('/system/ebay/disconnect'),
  saveEbaySelection: (body: EbaySelection) => api.patch<EbaySetupView>('/system/ebay/selection', body),
  createEbayLocation: (body: EbayLocationInput) => api.post<EbaySetupView>('/system/ebay/location', body),
};
