import { EbaySellException } from '../../domain/errors/ebay-sell.exception';
import {
  ebayErrorId,
  germanEbayHttpError,
  offerIdFromExistingOfferError,
} from '../../domain/listing/ebay-api-errors';
import { EbaySellEnv, ebayApiHost } from '../../domain/listing/ebay-sell-readiness';
import { EbayCategorySuggestion, EbaySellTransport } from './ebay-sell.types';

const SELL_SCOPE = [
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
].join(' ');
const APP_SCOPE = 'https://api.ebay.com/oauth/api_scope';
const CATEGORY_TREE_EBAY_DE = '77';

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

/**
 * HTTP-Client für Identity, Taxonomy und Sell Inventory.
 * `fetch` ist austauschbar, damit Tests aufgezeichnete Antworten einspeisen.
 */
export class EbaySellClient implements EbaySellTransport {
  private userToken: TokenCache | null = null;
  private appToken: TokenCache | null = null;

  constructor(
    private readonly env: EbaySellEnv,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async suggestCategory(query: string): Promise<EbayCategorySuggestion | null> {
    const token = await this.applicationToken();
    const url = new URL(
      `/commerce/taxonomy/v1/category_tree/${CATEGORY_TREE_EBAY_DE}/get_category_suggestions`,
      ebayApiHost(this.env.environment),
    );
    url.searchParams.set('q', query.slice(0, 100));
    const body = await this.send(url, token, 'GET', null, false);
    const suggestions = (body as { categorySuggestions?: { category?: { categoryId?: string; categoryName?: string } }[] })
      ?.categorySuggestions;
    const category = suggestions?.[0]?.category;
    if (!category?.categoryId || !category.categoryName) return null;
    return { categoryId: category.categoryId, categoryName: category.categoryName };
  }

  async aspectsForCategory(categoryId: string): Promise<{ name: string; required: boolean }[]> {
    const token = await this.applicationToken();
    const url = new URL(
      `/commerce/taxonomy/v1/category_tree/${CATEGORY_TREE_EBAY_DE}/get_item_aspects_for_category`,
      ebayApiHost(this.env.environment),
    );
    url.searchParams.set('category_id', categoryId);
    const body = await this.send(url, token, 'GET', null, false);
    const aspects = (body as { aspects?: { localizedAspectName?: string; aspectConstraint?: { aspectRequired?: boolean } }[] })
      ?.aspects;
    return (aspects ?? [])
      .filter((aspect) => aspect.localizedAspectName)
      .map((aspect) => ({
        name: aspect.localizedAspectName!,
        required: aspect.aspectConstraint?.aspectRequired === true,
      }));
  }

  async putInventoryItem(sku: string, body: unknown): Promise<void> {
    const token = await this.userTokenValue();
    const url = new URL(
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      ebayApiHost(this.env.environment),
    );
    await this.send(url, token, 'PUT', body, true);
  }

  async createOffer(body: unknown): Promise<{ offerId: string }> {
    const token = await this.userTokenValue();
    const url = new URL('/sell/inventory/v1/offer', ebayApiHost(this.env.environment));
    const created = await this.send(url, token, 'POST', body, true, { acceptExisting: true });
    const offerId = (created as { offerId?: string } | null)?.offerId;
    if (offerId) return { offerId };

    const sku = (body as { sku?: string }).sku;
    if (!sku) {
      throw new EbaySellException('eBay hat keine Angebots-ID zurückgegeben.');
    }
    const existing = await this.offerForSku(sku, token);
    if (!existing) {
      throw new EbaySellException('eBay hat das Angebot weder angelegt noch ein bestehendes gefunden.');
    }
    return existing;
  }

  async publishOffer(offerId: string): Promise<{ listingId: string }> {
    const token = await this.userTokenValue();
    const url = new URL(
      `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
      ebayApiHost(this.env.environment),
    );
    const body = await this.send(url, token, 'POST', {}, true);
    const listingId = (body as { listingId?: string } | null)?.listingId?.trim();
    if (!listingId) {
      throw new EbaySellException('eBay hat das Angebot nicht veröffentlicht: es kam keine Anzeigen-ID zurück.');
    }
    return { listingId };
  }

  async withdrawOffer(offerId: string): Promise<void> {
    const token = await this.userTokenValue();
    const url = new URL(
      `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/withdraw`,
      ebayApiHost(this.env.environment),
    );
    await this.send(url, token, 'POST', {}, true);
  }

  private async offerForSku(sku: string, token: string): Promise<{ offerId: string } | null> {
    const url = new URL('/sell/inventory/v1/offer', ebayApiHost(this.env.environment));
    url.searchParams.set('sku', sku);
    const body = await this.send(url, token, 'GET', null, true);
    const offerId = (body as { offers?: { offerId?: string }[] } | null)?.offers?.[0]?.offerId?.trim();
    return offerId ? { offerId } : null;
  }

  private async userTokenValue(): Promise<string> {
    return this.token('refresh_token', SELL_SCOPE, this.env.refreshToken ?? '', 'user');
  }

  private async applicationToken(): Promise<string> {
    return this.token('client_credentials', APP_SCOPE, null, 'app');
  }

  private async token(
    grant: 'refresh_token' | 'client_credentials',
    scope: string,
    refreshToken: string | null,
    cache: 'user' | 'app',
  ): Promise<string> {
    const current = cache === 'user' ? this.userToken : this.appToken;
    if (current && Date.now() < current.expiresAt - 60_000) return current.accessToken;

    const clientId = this.env.clientId ?? '';
    const clientSecret = this.env.clientSecret ?? '';
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const params = new URLSearchParams({ grant_type: grant, scope });
    if (grant === 'refresh_token') params.set('refresh_token', refreshToken ?? '');

    const response = await this.fetchImpl(new URL('/identity/v1/oauth2/token', ebayApiHost(this.env.environment)), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const body = await readBody(response);
    if (!response.ok) {
      throw new EbaySellException(germanEbayHttpError(response.status, body));
    }
    const accessToken = (body as { access_token?: string } | null)?.access_token;
    const expiresIn = (body as { expires_in?: number } | null)?.expires_in ?? 0;
    if (!accessToken) {
      throw new EbaySellException('eBay hat kein Zugangstoken geliefert.');
    }
    const next = { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
    if (cache === 'user') this.userToken = next;
    else this.appToken = next;
    return accessToken;
  }

  private async send(
    url: URL,
    token: string,
    method: 'GET' | 'PUT' | 'POST',
    body: unknown,
    userContentLanguage: boolean,
    options?: { acceptExisting?: boolean },
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_DE',
    };
    if (userContentLanguage) headers['Content-Language'] = 'de-DE';

    const response = await this.fetchImpl(url, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
    });
    const parsed = await readBody(response);
    if (response.ok) return parsed;

    if (options?.acceptExisting && ebayErrorId(parsed, 25002)) {
      const offerId = offerIdFromExistingOfferError(parsed);
      if (offerId) return { offerId };
      return null;
    }

    throw new EbaySellException(germanEbayHttpError(response.status, parsed), { status: response.status });
  }
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
