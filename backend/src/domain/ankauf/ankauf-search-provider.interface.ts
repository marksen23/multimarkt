import type { AnkaufPlatform } from './ankauf.types';

export interface AnkaufSearchQuery {
  keywords: string;
  location: string;
}

export interface RawAnkaufListing {
  title: string;
  price: number;
  platform: AnkaufPlatform;
  url: string | null;
  condition: string | null;
}

export interface AnkaufSearchProviderResult {
  marketMedian: number | null;
  listings: RawAnkaufListing[];
  /**
   * true, wenn keine echte Quelle gefragt wurde. Dann sind `listings`
   * leer und die Oberfläche zeigt Suchlinks statt erfundener Anzeigen.
   */
  illustrative?: boolean;
}

export interface AnkaufSearchProvider {
  search(query: AnkaufSearchQuery): Promise<AnkaufSearchProviderResult | null>;
}

export const ANKAUF_SEARCH_PROVIDER = Symbol('ANKAUF_SEARCH_PROVIDER');
