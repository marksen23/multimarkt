import { api } from './client';
import type { MarginAssumptions } from '../margin/expected-margin';
import type { DeletionAuditLog } from './types';

export const accountApi = {
  getMarginAssumptions: () => api.get<MarginAssumptions>('/account/margin-assumptions'),
  updateMarginAssumptions: (body: MarginAssumptions) =>
    api.patch<MarginAssumptions>('/account/margin-assumptions', body),
  requestDeletion: () => api.post<DeletionAuditLog>('/account/deletion-request'),
  deletionStatus: (hash: string) =>
    api.get<DeletionAuditLog>(`/account/deletion-status/${hash}`),
};
