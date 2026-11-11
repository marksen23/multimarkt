import { api } from './client';
import type { IntegrationStatus } from './types';

export const systemApi = {
  integrations: () => api.get<IntegrationStatus>('/system/integrations'),
};
