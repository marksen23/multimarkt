/**
 * Provider-Abstraktion für Markt-Verteilungs-Quellen (docs/README.md §9e,
 * §9d) — z.B. eBay Browse API. Liefert eine Preis-VERTEILUNG (Median +
 * Perzentile aus mehreren aktiven Angeboten), im Unterschied zum
 * `BuybackAnchorProvider`, der einen EINZELNEN Ankaufspreis liefert.
 * Austauschbar nach demselben Muster wie `AiVisionProvider`.
 */
export interface MarketDistributionQuery {
  keywords: string;
  condition: string | null;
}

/**
 * Titel eines Vergleichsangebots — kommt kostenlos aus derselben
 * Suchanfrage wie die Preisverteilung (kein zusätzlicher API-Call). Volle
 * Beschreibungstexte bräuchten pro Angebot einen separaten Detail-Call
 * (eBay Item API) und sind bewusst NICHT Teil des MVP (§9e-Ergänzung,
 * September 2026: eBay dient nur zum Preis- UND Titel-/Beschreibungs-
 * vergleich, aber die MVP-Version vergleicht nur, was ohnehin schon
 * abgerufen wird — kein zusätzlicher Kostenfaktor).
 */
export interface ComparableListing {
  title: string;
  price: number;
}

export interface MarketDistributionResult {
  median: number;
  p25: number;
  p75: number;
  /** Anzahl der Angebote, aus denen die Verteilung berechnet wurde. */
  sampleSize: number;
  currency: string;
  providerLabel: string;
  /** Beispieltitel zum Abgleich ("wie beschreiben andere das?"), keine vollen Beschreibungstexte. */
  comparableListings: ComparableListing[];
}

export interface MarketDistributionProvider {
  /**
   * Liefert `null`, wenn keine Treffer gefunden wurden. Die Mindest-
   * Stichprobengröße (§9d Punkt 4) wird bewusst NICHT hier, sondern
   * zentral im `PriceTriangulationService` durchgesetzt — der Provider
   * kennt nur Rohdaten, keine Geschäftsregeln.
   */
  search(query: MarketDistributionQuery): Promise<MarketDistributionResult | null>;
}

export const MARKET_DISTRIBUTION_PROVIDER = Symbol('MARKET_DISTRIBUTION_PROVIDER');

/** §9d Punkt 4: unter dieser Stichprobengröße wird kein Vorschlag angezeigt. */
export const MIN_MARKET_SAMPLE_SIZE = 5;
