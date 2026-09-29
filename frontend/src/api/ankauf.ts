import { api } from './client';
import type { AnkaufResearchResult } from './types';

export const ankaufApi = {
  search: (keywords: string) =>
    api.post<AnkaufResearchResult>('/ankauf/search', { keywords }),
};
