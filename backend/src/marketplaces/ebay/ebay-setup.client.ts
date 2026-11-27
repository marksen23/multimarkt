import { Injectable } from '@nestjs/common';
import { EbaySellException } from '../../domain/errors/ebay-sell.exception';
import { germanEbayHttpError } from '../../domain/listing/ebay-api-errors';
import { EbaySellEnv, ebayApiHost } from '../../domain/listing/ebay-sell-readiness';
import {
  EBAY_OAUTH_SCOPES,
  ebayIdentityHost,
  parseEbayTokenResponse,
  type EbayTokenSet,
} from './ebay-oauth';
import {
  policiesNotOptedIn,
  readLocations,
  readPolicyList,
} from './ebay-setup.logic';
import { EMPTY_EBAY_CATALOG, POLICIES_NOT_OPTED_IN_HINT, type EbayCatalog } from './ebay-setup.types';

export interface EbayAppCredentials {
  clientId?: string | null;
  clientSecret?: string | null;
  ruName?: string | null;
  environment?: string | null;
}

export interface EbayLocationDraft {
  key: string;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
}

export interface EbayCatalogResult {
  optedIn: boolean;
  hint: string | null;
  catalog: EbayCatalog;
}

interface CallResult {
  status: number;
  body: unknown;
}

/**
 * HTTP gegen Identity, Account und Inventory für die Einrichtung.
 * `fetch` ist austauschbar, damit Tests aufgezeichnete Antworten einspeisen.
 * Zugangstoken werden nicht geloggt.
 */
@Injectable()
export class EbaySetupClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async exchangeCode(creds: EbayAppCredentials, code: string): Promise<EbayTokenSet> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: creds.ruName ?? '',
    });
    return this.requestToken(creds, body, true);
  }

  async userAccessToken(env: EbaySellEnv): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: env.refreshToken ?? '',
      scope: EBAY_OAUTH_SCOPES.join(' '),
    });
    const token = await this.requestToken(env, body, false);
    return token.accessToken;
  }

  async identity(
    env: { environment?: string | null },
    accessToken: string,
  ): Promise<{ userId: string; username: string } | null> {
    const url = new URL('/commerce/identity/v1/user/', ebayIdentityHost(env.environment));
    let result: CallResult;
    try {
      result = await this.call(url, accessToken, 'GET', null);
    } catch {
      return null;
    }
    if (result.status < 200 || result.status >= 300) return null;
    const userId = textField(result.body, 'userId');
    const username = textField(result.body, 'username');
    if (!userId && !username) return null;
    return { userId: userId || username, username: username || userId };
  }

  async loadCatalog(env: EbaySellEnv, accessToken: string): Promise<EbayCatalogResult> {
    const root = ebayApiHost(env.environment);
    const [fulfillment, payment, returns, locations] = await Promise.all([
      this.policyCall(new URL('/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_DE', root), accessToken),
      this.policyCall(new URL('/sell/account/v1/payment_policy?marketplace_id=EBAY_DE', root), accessToken),
      this.policyCall(new URL('/sell/account/v1/return_policy?marketplace_id=EBAY_DE', root), accessToken),
      this.policyCall(new URL('/sell/inventory/v1/location?limit=100', root), accessToken),
    ]);
    const optedOut = [fulfillment, payment, returns].some((result) => result.notOptedIn);
    if (optedOut) {
      return {
        optedIn: false,
        hint: POLICIES_NOT_OPTED_IN_HINT,
        catalog: {
          ...EMPTY_EBAY_CATALOG,
          locations: locations.notOptedIn ? [] : readLocations(locations.body),
        },
      };
    }
    return {
      optedIn: true,
      hint: null,
      catalog: {
        fulfillmentPolicies: readPolicyList(fulfillment.body, 'fulfillmentPolicies', 'fulfillmentPolicyId'),
        paymentPolicies: readPolicyList(payment.body, 'paymentPolicies', 'paymentPolicyId'),
        returnPolicies: readPolicyList(returns.body, 'returnPolicies', 'returnPolicyId'),
        locations: readLocations(locations.body),
      },
    };
  }

  async createLocation(env: EbaySellEnv, accessToken: string, draft: EbayLocationDraft): Promise<void> {
    const url = new URL(
      `/sell/inventory/v1/location/${encodeURIComponent(draft.key)}`,
      ebayApiHost(env.environment),
    );
    const result = await this.call(url, accessToken, 'POST', {
      name: draft.name,
      merchantLocationStatus: 'ENABLED',
      locationTypes: ['WAREHOUSE'],
      location: {
        address: {
          addressLine1: draft.street,
          city: draft.city,
          postalCode: draft.postalCode,
          country: draft.country,
        },
      },
    });
    if (result.status >= 200 && result.status < 300) return;
    throw new EbaySellException(germanEbayHttpError(result.status, result.body), {}, result.status === 401);
  }

  private async policyCall(url: URL, accessToken: string): Promise<{ notOptedIn: boolean; body: unknown }> {
    const result = await this.call(url, accessToken, 'GET', null);
    if (result.status >= 200 && result.status < 300) return { notOptedIn: false, body: result.body };
    if (policiesNotOptedIn(result.status, result.body)) return { notOptedIn: true, body: result.body };
    throw new EbaySellException(germanEbayHttpError(result.status, result.body), {}, result.status === 401);
  }

  private async requestToken(creds: EbayAppCredentials, body: URLSearchParams, requireRefresh: boolean): Promise<EbayTokenSet> {
    const credentials = Buffer.from(`${creds.clientId ?? ''}:${creds.clientSecret ?? ''}`).toString('base64');
    let response: Response;
    try {
      response = await this.fetchImpl(new URL('/identity/v1/oauth2/token', ebayApiHost(creds.environment)), {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw networkError(error);
    }
    const parsed = await readBody(response);
    if (!response.ok) {
      const rejected = response.status === 401 || oauthError(parsed) === 'invalid_grant';
      throw new EbaySellException(germanEbayHttpError(response.status, parsed), {}, rejected);
    }
    return parseEbayTokenResponse(parsed, { requireRefresh });
  }

  private async call(url: URL, accessToken: string, method: 'GET' | 'POST', body: unknown): Promise<CallResult> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Language': 'de-DE',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_DE',
        },
        body: body == null ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw networkError(error);
    }
    return { status: response.status, body: await readBody(response) };
  }
}

function networkError(error: unknown): EbaySellException {
  const name = error instanceof Error ? error.name : '';
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new EbaySellException('eBay hat nicht rechtzeitig geantwortet. Versuch es gleich noch einmal.');
  }
  return new EbaySellException('eBay ist gerade nicht erreichbar.');
}

function oauthError(body: unknown): string {
  if (!body || typeof body !== 'object' || !('error' in body)) return '';
  return String((body as { error?: unknown }).error ?? '');
}

function textField(body: unknown, key: string): string {
  if (!body || typeof body !== 'object') return '';
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
