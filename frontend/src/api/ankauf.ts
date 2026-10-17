import { api } from './client';
import type { AnkaufResearchResult, AnkaufSearchProfile, AnkaufSearchSummary } from './types';

export const ankaufApi = {
  profile: () => api.get<AnkaufSearchProfile>('/ankauf/profile'),
  updateProfile: (body: { postalCode: string; radiusKm: number }) =>
    api.patch<AnkaufSearchProfile>('/ankauf/profile', body),
  search: (keywords: string) => api.post<AnkaufResearchResult>('/ankauf/search', { keywords }),
  searches: () => api.get<AnkaufSearchSummary[]>('/ankauf/searches'),
  openSearch: (id: string) => api.get<AnkaufResearchResult>(`/ankauf/searches/${id}`),
};
