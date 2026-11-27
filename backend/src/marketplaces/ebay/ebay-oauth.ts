import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { EbaySellException } from '../../domain/errors/ebay-sell.exception';

export const EBAY_OAUTH_SCOPES = [
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
] as const;

const STATE_TTL_MS = 15 * 60 * 1000;

export function ebayAuthHost(environment: string | null | undefined): string {
  return environment?.trim().toLowerCase() === 'sandbox' ? 'https://auth.sandbox.ebay.com' : 'https://auth.ebay.com';
}

export function ebayIdentityHost(environment: string | null | undefined): string {
  return environment?.trim().toLowerCase() === 'sandbox' ? 'https://apiz.sandbox.ebay.com' : 'https://apiz.ebay.com';
}

export function ebayCallbackUrl(publicBaseUrl: string | null | undefined): string {
  const base = (publicBaseUrl ?? '').trim().replace(/\/$/, '');
  const path = '/api/system/ebay/callback';
  if (!base || !/^https?:\/\//i.test(base)) return path;
  return `${base}${path}`;
}

export function ebayAuthorizeUrl(input: {
  environment?: string | null;
  clientId: string;
  ruName: string;
  state: string;
}): string {
  const url = new URL('/oauth2/authorize', ebayAuthHost(input.environment));
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.ruName);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', EBAY_OAUTH_SCOPES.join(' '));
  url.searchParams.set('state', input.state);
  return url.toString();
}

export function createOauthState(secret: string, now = Date.now()): { state: string; hash: string; expiresAt: Date } {
  const payload = { n: randomBytes(16).toString('base64url'), e: now + STATE_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  const state = `${body}.${sig}`;
  return { state, hash: oauthStateHash(state), expiresAt: new Date(payload.e) };
}

export function verifyOauthState(state: string, secret: string, now: number): { ok: true; hash: string } | { ok: false } {
  if (!state || state.length > 512) return { ok: false };
  const parts = state.split('.');
  if (parts.length !== 2) return { ok: false };
  const [body, sig] = parts;
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return { ok: false };
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { e?: unknown };
    if (typeof payload.e !== 'number' || payload.e < now) return { ok: false };
  } catch {
    return { ok: false };
  }
  return { ok: true, hash: oauthStateHash(state) };
}

export function oauthStateHash(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

export interface EbayTokenSet {
  accessToken: string;
  expiresIn: number;
  refreshToken: string | null;
  refreshExpiresIn: number | null;
}

/** Liest die Token-Antwort. Wirft die Beschreibung von eBay nicht weiter, sie kann Geheimnisse enthalten. */
export function parseEbayTokenResponse(body: unknown, options?: { requireRefresh?: boolean }): EbayTokenSet {
  const accessToken =
    body && typeof body === 'object' && typeof (body as { access_token?: unknown }).access_token === 'string'
      ? (body as { access_token: string }).access_token
      : '';
  if (!accessToken) {
    throw new EbaySellException('eBay hat kein Zugangstoken geliefert.');
  }
  const refresh =
    body && typeof body === 'object' && typeof (body as { refresh_token?: unknown }).refresh_token === 'string'
      ? (body as { refresh_token: string }).refresh_token
      : '';
  if (options?.requireRefresh && !refresh) {
    throw new EbaySellException('eBay hat kein Refresh-Token geliefert. Die Verbindung kann nicht gespeichert werden.');
  }
  const expiresIn = body && typeof body === 'object' ? (body as { expires_in?: unknown }).expires_in : 0;
  const refreshExpiresIn =
    body && typeof body === 'object' ? (body as { refresh_token_expires_in?: unknown }).refresh_token_expires_in : null;
  return {
    accessToken,
    expiresIn: typeof expiresIn === 'number' ? expiresIn : 0,
    refreshToken: refresh || null,
    refreshExpiresIn: typeof refreshExpiresIn === 'number' ? refreshExpiresIn : null,
  };
}
