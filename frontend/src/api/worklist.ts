import { api } from './client';
import type { Worklist } from './types';

export const worklistApi = {
  get: () => api.get<Worklist>('/worklist'),
};
