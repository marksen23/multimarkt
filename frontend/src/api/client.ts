import type { ApiError } from './types';

// Doc 04 §17: Erfolgsantworten sind { data, meta }. Fehlerantworten (Doc 04
// §5, siehe DomainExceptionFilter im Backend) sind { error_code, message,
// details }. Dieser Client entpackt beides einheitlich.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.message);
    this.status = status;
    this.body = body;
  }
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem('resale_os_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...init?.headers,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      body ?? { error_code: 'ERR_UNKNOWN', message: response.statusText, details: {} },
    );
  }

  return (body?.data ?? body) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
};
