import { api } from './client';
import type { DeletionAuditLog } from './types';

export const accountApi = {
  requestDeletion: () => api.post<DeletionAuditLog>('/account/deletion-request'),
  deletionStatus: (hash: string) =>
    api.get<DeletionAuditLog>(`/account/deletion-status/${hash}`),
};
