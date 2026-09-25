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

// `fetch()` selbst wirft (statt eine Response zurückzugeben), wenn gar keine
// Verbindung zustande kam (offline, DNS-Fehler, Server down) — ohne diesen
// Wrapper landete das als "Unbekannter Fehler" überall im UI, obwohl es sich
// klar von einem 4xx/5xx unterscheiden lässt. Einmal hier abgefangen, zeigen
// alle bestehenden `e instanceof ApiRequestError ? e.body.message : …`-Stellen
// automatisch eine sinnvolle Meldung statt des generischen Fallbacks.
async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiRequestError(0, {
      error_code: 'ERR_NETWORK',
      message: 'Keine Verbindung zum Server — prüfe deine Internetverbindung und versuche es erneut.',
      details: {},
    });
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await safeFetch(`${BASE_URL}${path}`, {
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

async function requestForm<T>(path: string, formData: FormData): Promise<T> {
  const response = await safeFetch(`${BASE_URL}${path}`, {
    method: 'POST',
    // Kein 'Content-Type' setzen — der Browser generiert die korrekte
    // multipart/form-data-Boundary automatisch (Doc 04 §7 "Foto-Erfassung").
    headers: { ...authHeader() },
    body: formData,
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
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  postForm: <T>(path: string, formData: FormData) => requestForm<T>(path, formData),
};
