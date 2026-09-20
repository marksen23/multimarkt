/**
 * Provider-Abstraktion für Ankaufportale (docs/README.md §9e) — z.B. momox,
 * reBuy, Zoxs. Liefert einen EINZELNEN Ankaufspreis (kein Verteilungs-
 * signal), der als kaltstart-freier Preis-Anker dient. Die Umrechnung
 * Ankaufspreis -> erwarteter Privatverkaufspreis passiert bewusst NICHT im
 * Provider, sondern im `PriceTriangulationService` (siehe
 * `BUYBACK_TO_RESALE_MULTIPLIER` dort) — der Provider liefert nur den
 * rohen Ankaufs-Quote.
 *
 * WICHTIG (§9e): ob ein konkretes Portal eine echte API oder nur ein
 * Web-Formular ohne Automatisierungsmöglichkeit hat, ist noch nicht
 * web-verifiziert. Bis dahin ist nur ein Mock gebunden.
 */
export interface BuybackAnchorQuery {
  brand: string | null;
  category: string | null;
  ean?: string;
}

export interface BuybackQuote {
  buybackPrice: number;
  currency: string;
  portalName: string;
}

export interface BuybackAnchorProvider {
  /** Liefert `null`, wenn das Portal für diese Kategorie/ohne Marke keinen seriösen Quote geben kann. */
  quote(query: BuybackAnchorQuery): Promise<BuybackQuote | null>;
}

export const BUYBACK_ANCHOR_PROVIDER = Symbol('BUYBACK_ANCHOR_PROVIDER');
