import { EBAY_OAUTH_SCOPES, createOauthState, ebayAuthorizeUrl, ebayCallbackUrl, parseEbayTokenResponse, verifyOauthState } from './ebay-oauth';

const SECRET = 'state-signing-secret';

describe('ebay oauth state', () => {
  it('accepts a state it just issued and rejects tampering, the wrong secret and expiry', () => {
    const now = Date.parse('2026-11-27T12:00:00Z');
    const issued = createOauthState(SECRET, now);
    expect(verifyOauthState(issued.state, SECRET, now).ok).toBe(true);
    expect(verifyOauthState(issued.state, SECRET, now)).toEqual({ ok: true, hash: issued.hash });
    expect(verifyOauthState(issued.state, 'other-secret', now).ok).toBe(false);
    expect(verifyOauthState(`${issued.state}x`, SECRET, now).ok).toBe(false);
    expect(verifyOauthState(issued.state, SECRET, issued.expiresAt.getTime() + 1).ok).toBe(false);
    expect(issued.state).not.toContain(SECRET);
  });
});

describe('ebay authorize url', () => {
  it('points at production or sandbox and carries the RuName, scopes and state, not the secret', () => {
    const url = new URL(ebayAuthorizeUrl({ clientId: 'app-id', ruName: 'Markus-ResaleOS-RuName', state: 'state-1' }));
    expect(url.origin).toBe('https://auth.ebay.com');
    expect(url.pathname).toBe('/oauth2/authorize');
    expect(url.searchParams.get('client_id')).toBe('app-id');
    expect(url.searchParams.get('redirect_uri')).toBe('Markus-ResaleOS-RuName');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual([...EBAY_OAUTH_SCOPES]);
    expect(url.toString()).not.toContain('cert-secret');

    const sandbox = new URL(
      ebayAuthorizeUrl({ environment: 'sandbox', clientId: 'app-id', ruName: 'Ru', state: 's' }),
    );
    expect(sandbox.origin).toBe('https://auth.sandbox.ebay.com');
  });

  it('builds the callback the RuName must accept', () => {
    expect(ebayCallbackUrl('https://resale.example.com/')).toBe('https://resale.example.com/api/system/ebay/callback');
    expect(ebayCallbackUrl('')).toBe('/api/system/ebay/callback');
  });
});

describe('parseEbayTokenResponse', () => {
  it('reads a recorded authorization-code response and hides a secret error description', () => {
    const parsed = parseEbayTokenResponse(
      {
        access_token: 'v^1.1#access',
        expires_in: 7200,
        refresh_token: 'v^1.1#refresh-secret',
        refresh_token_expires_in: 47304000,
        token_type: 'User Access Token',
      },
      { requireRefresh: true },
    );
    expect(parsed.refreshToken).toBe('v^1.1#refresh-secret');
    expect(parsed.expiresIn).toBe(7200);
    expect(parsed.refreshExpiresIn).toBe(47304000);

    expect(() => parseEbayTokenResponse({ access_token: 'only-access' }, { requireRefresh: true })).toThrow(
      /Refresh-Token/,
    );
  });
});
