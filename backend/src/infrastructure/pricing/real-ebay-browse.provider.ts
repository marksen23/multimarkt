import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MarketDistributionProvider,
  MarketDistributionQuery,
  MarketDistributionResult,
} from '../../domain/pricing/market-distribution-provider.interface';

const TOKEN_ENDPOINT = 'https://api.ebay.com/identity/v1/oauth2/token';
const SEARCH_ENDPOINT = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const MARKETPLACE_ID = 'EBAY_DE';
const OAUTH_SCOPE = 'https://api.ebay.com/oauth/api_scope';
const MIN_SAMPLE_SIZE = 3;

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

interface EbayItemSummary {
  title: string;
  price?: { value: string };
}

interface EbaySearchResponse {
  itemSummaries?: EbayItemSummary[];
}

@Injectable()
export class RealEbayBrowseProvider implements MarketDistributionProvider {
  private tokenCache: TokenCache | null = null;

  constructor(private readonly config: ConfigService) {}

  async search(query: MarketDistributionQuery): Promise<MarketDistributionResult | null> {
    if (!query.keywords.trim()) return null;

    try {
      const token = await this.getAccessToken();
      const items = await this.fetchListings(token, query.keywords);
      if (items.length < MIN_SAMPLE_SIZE) return null;

      const prices = items.map((i) => i.price).sort((a, b) => a - b);
      return {
        median: this.percentile(prices, 0.5),
        p25: this.percentile(prices, 0.25),
        p75: this.percentile(prices, 0.75),
        sampleSize: prices.length,
        currency: 'EUR',
        providerLabel: 'eBay Browse API',
        comparableListings: items.slice(0, 10).map((i) => ({ title: i.title, price: i.price })),
      };
    } catch {
      return null;
    }
  }

  private async getAccessToken(): Promise<string> {
    // 60s safety margin to avoid using an about-to-expire token
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - 60_000) {
      return this.tokenCache.accessToken;
    }

    const clientId = this.config.get<string>('EBAY_CLIENT_ID')!;
    const clientSecret = this.config.get<string>('EBAY_CLIENT_SECRET')!;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: OAUTH_SCOPE }).toString(),
    });

    if (!res.ok) throw new Error(`eBay OAuth error: ${res.status}`);

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.tokenCache = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  private async fetchListings(
    token: string,
    keywords: string,
  ): Promise<{ title: string; price: number }[]> {
    const params = new URLSearchParams({
      q: keywords,
      limit: '50',
      // conditionIds: 3000 = Used, 2500 = Very Good, 2000 = Good
      filter: 'conditionIds:{3000|2500|2000}',
    });

    const res = await fetch(`${SEARCH_ENDPOINT}?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE_ID,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) return [];

    const data = (await res.json()) as EbaySearchResponse;
    return (data.itemSummaries ?? [])
      .filter((i) => i.price?.value)
      .map((i) => ({ title: i.title, price: parseFloat(i.price!.value) }))
      .filter((i) => !isNaN(i.price) && i.price > 0);
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 1) return Math.round(sorted[0] * 100) / 100;
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return Math.round(((sorted[lo] + sorted[hi]) / 2) * 100) / 100;
  }
}
