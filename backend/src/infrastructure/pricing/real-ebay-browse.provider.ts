import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { selectComparableListings } from '../../domain/pricing/comparable-listings';
import {
  ComparableListing,
  MarketDistributionProvider,
  MarketDistributionQuery,
  MarketDistributionResult,
} from '../../domain/pricing/market-distribution-provider.interface';
import {
  EBAY_AUTH_MESSAGE,
  EBAY_MISSING_KEYS_MESSAGE,
  EBAY_UNAVAILABLE_MESSAGE,
  MarketSearchError,
  ebayHttpError,
} from '../../domain/pricing/market-search-error';

// Dieselbe Markierung wie integration-status.ts. Ein Platzhalter ist kein Schlüssel.
const KEY_PLACEHOLDER = 'unused-mock-provider-active';

const TOKEN_ENDPOINT = 'https://api.ebay.com/identity/v1/oauth2/token';
const SEARCH_ENDPOINT = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const MARKETPLACE_ID = 'EBAY_DE';
const OAUTH_SCOPE = 'https://api.ebay.com/oauth/api_scope';
// 3000 Used, 4000 Very Good, 5000 Good, 6000 Acceptable.
// 2000/2500 sind generalüberholt, nicht „Gut“ / „Sehr gut“.
const USED_CONDITION_FILTER = 'conditionIds:{3000|4000|5000|6000}';

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

interface EbayMoney {
  value?: string;
  currency?: string;
}

interface EbayItemSummary {
  title?: string;
  price?: EbayMoney;
  itemWebUrl?: string;
  condition?: string;
  shippingOptions?: Array<{
    shippingCost?: EbayMoney;
    shippingCostType?: string;
  }>;
}

interface EbaySearchResponse {
  itemSummaries?: EbayItemSummary[];
}

interface SearchAttempt {
  conditionFilter: string | null;
  country: boolean;
}

/**
 * Aktive Angebotspreise auf eBay.de. Die Browse API liefert keine
 * abgeschlossenen Verkäufe. Der Faktor 0,87 sitzt deshalb erst in der
 * Preisempfehlung, nicht hier.
 */
@Injectable()
export class RealEbayBrowseProvider implements MarketDistributionProvider {
  private readonly logger = new Logger(RealEbayBrowseProvider.name);
  private tokenCache: TokenCache | null = null;

  constructor(private readonly config: ConfigService) {}

  async search(query: MarketDistributionQuery): Promise<MarketDistributionResult | null> {
    if (!query.keywords.trim()) return null;
    this.assertKeys();

    try {
      const token = await this.getAccessToken();
      const filtered = await this.searchAttempts(token, query);
      if (!filtered || filtered.kept.length < 1 || filtered.median == null || filtered.p25 == null || filtered.p75 == null) {
        return null;
      }

      return {
        median: filtered.median,
        p25: filtered.p25,
        p75: filtered.p75,
        sampleSize: filtered.kept.length,
        currency: 'EUR',
        providerLabel: 'eBay Browse API',
        comparableListings: filtered.kept.slice(0, 20),
        priceKind: 'ASKING',
        marketplace: MARKETPLACE_ID,
        excludedCount: filtered.excludedCount,
        filterNote: filtered.filterNote,
      };
    } catch (error) {
      if (error instanceof MarketSearchError) throw error;
      this.logger.warn(`eBay Browse search failed: ${(error as Error).message}`);
      throw new MarketSearchError('UNAVAILABLE', EBAY_UNAVAILABLE_MESSAGE);
    }
  }

  private assertKeys(): void {
    const clientId = this.config.get<string>('EBAY_CLIENT_ID');
    const clientSecret = this.config.get<string>('EBAY_CLIENT_SECRET');
    if (!isRealKey(clientId) || !isRealKey(clientSecret)) {
      throw new MarketSearchError('MISSING_KEYS', EBAY_MISSING_KEYS_MESSAGE);
    }
  }

  private async searchAttempts(
    token: string,
    query: MarketDistributionQuery,
  ): Promise<ReturnType<typeof selectComparableListings> | null> {
    const attempts: SearchAttempt[] = [
      { conditionFilter: USED_CONDITION_FILTER, country: true },
      { conditionFilter: USED_CONDITION_FILTER, country: false },
      { conditionFilter: null, country: true },
    ];
    let best: ReturnType<typeof selectComparableListings> | null = null;
    let sawOk = false;
    let lastError: MarketSearchError | null = null;

    for (const attempt of attempts) {
      let raw: ComparableListing[];
      try {
        raw = await this.fetchListings(token, query, attempt);
        sawOk = true;
      } catch (error) {
        if (error instanceof MarketSearchError && (error.code === 'AUTH' || error.code === 'RATE_LIMIT')) {
          throw error;
        }
        lastError =
          error instanceof MarketSearchError ? error : new MarketSearchError('UNAVAILABLE', EBAY_UNAVAILABLE_MESSAGE);
        continue;
      }

      const filtered = selectComparableListings(raw, {
        keywords: query.keywords,
        brand: query.brand,
        model: query.model,
        product: query.product,
        itemCondition: query.condition,
        requireModel: query.requireModel,
        requireBrand: query.requireBrand,
      });
      if (!best || filtered.kept.length > best.kept.length) best = filtered;
      if (filtered.kept.length >= 3) break;
    }

    if (!best && !sawOk && lastError) throw lastError;
    return best;
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - 60_000) {
      return this.tokenCache.accessToken;
    }

    const clientId = this.config.get<string>('EBAY_CLIENT_ID')!;
    const clientSecret = this.config.get<string>('EBAY_CLIENT_SECRET')!;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    let res: Response;
    try {
      res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: OAUTH_SCOPE }).toString(),
      });
    } catch {
      throw new MarketSearchError('UNAVAILABLE', EBAY_UNAVAILABLE_MESSAGE);
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new MarketSearchError('AUTH', EBAY_AUTH_MESSAGE);
      throw ebayHttpError(res.status);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.tokenCache = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  private async fetchListings(
    token: string,
    query: MarketDistributionQuery,
    attempt: SearchAttempt,
  ): Promise<ComparableListing[]> {
    const params = new URLSearchParams({
      q: query.keywords,
      limit: '50',
    });
    const filter = ebayFilter(attempt);
    if (filter) params.set('filter', filter);

    let res: Response;
    try {
      res = await fetch(`${SEARCH_ENDPOINT}?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE_ID,
          'X-EBAY-C-ENDUSERCTX': endUserContext(query.postalCode),
          'Accept-Language': 'de-DE',
        },
      });
    } catch {
      throw new MarketSearchError('UNAVAILABLE', EBAY_UNAVAILABLE_MESSAGE);
    }

    if (!res.ok) {
      this.logger.warn(`eBay Browse search HTTP ${res.status} for "${query.keywords}"`);
      throw ebayHttpError(res.status);
    }

    const data = (await res.json()) as EbaySearchResponse;
    return (data.itemSummaries ?? []).flatMap((item) => {
      const listing = toListing(item);
      return listing ? [listing] : [];
    });
  }
}

function ebayFilter(attempt: SearchAttempt): string | null {
  const parts: string[] = [];
  if (attempt.conditionFilter) parts.push(attempt.conditionFilter);
  if (attempt.country) parts.push('itemLocationCountry:DE');
  return parts.length > 0 ? parts.join(',') : null;
}

function endUserContext(postalCode: string | null | undefined): string {
  const zip = postalCode && /^\d{5}$/.test(postalCode) ? `,zip=${postalCode}` : '';
  return `contextualLocation=country=DE${zip}`;
}

function toListing(item: EbayItemSummary): ComparableListing | null {
  const title = item.title?.trim();
  const amount = parseMoney(item.price?.value);
  if (!title || amount == null) return null;
  const shipping = shippingEur(item);
  const price = shipping != null && shipping > 0 ? round2(amount + shipping) : amount;
  return {
    title,
    price,
    url: item.itemWebUrl ?? null,
    condition: item.condition?.trim() || null,
    shippingEur: shipping,
    currency: item.price?.currency?.trim() || 'EUR',
  };
}

function shippingEur(item: EbayItemSummary): number | null {
  const option = item.shippingOptions?.find(
    (entry) => entry.shippingCostType === 'FIXED' || entry.shippingCostType === 'FREE',
  );
  if (!option) return null;
  if (option.shippingCostType === 'FREE') return 0;
  const currency = option.shippingCost?.currency?.toUpperCase();
  if (currency && currency !== 'EUR') return null;
  return parseMoney(option.shippingCost?.value);
}

function parseMoney(value: string | undefined): number | null {
  if (!value) return null;
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isRealKey(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 && trimmed !== KEY_PLACEHOLDER;
}
