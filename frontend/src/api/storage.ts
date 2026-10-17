import { api } from './client';

export interface PhotoStorageStatus {
  durable: boolean;
}

export const storageApi = {
  status: () => api.get<PhotoStorageStatus>('/storage/status'),
};
