/**
 * Adapter-Abstraktion für Marktplätze (README §10 "Product → Listing";
 * Doc 01 §9 "Live API vs. Formatierungshilfe"). Austauschbar wie der
 * AI-Vision-Provider (Doc 01 §16): ein echter eBay-SDK-Adapter ersetzt
 * später nur das Binding hinter `MARKETPLACE_ADAPTERS`, kein Aufrufer-Code
 * ändert sich.
 *
 * Zwei grundsätzlich verschiedene Plattform-Typen (Doc 03 §3.5 Marketplace
 * Integrity: "Eine Formatierungshilfe darf systemintern niemals als
 * Live-API-Integration behandelt werden"):
 * - Live-API (z.B. eBay): `publish()` schließt sofort ab, liefert eine
 *   echte externe ID, `requiresManualConfirmation: false`.
 * - Formatierungshilfe (z.B. Kleinanzeigen, kein autorisierter API-Zugang,
 *   siehe README §4b): `publish()` bereitet nur Text/Bilder vor, liefert
 *   KEINE externe ID (es gibt noch kein echtes Listing), und verlangt
 *   `requiresManualConfirmation: true` — der Nutzer bestätigt selbst, dass
 *   er es manuell eingestellt hat (Doc 02 §5 "API Success / User Copy").
 */
export interface MarketplacePublishInput {
  canonicalListingId: string;
  marketplaceId: string;
  sellingPrice: number;
  descriptionText: string;
  fallbackData: Record<string, string>;
}

export interface MarketplacePublishResult {
  externalPlatformId: string | null;
  requiresManualConfirmation: boolean;
}

export interface MarketplaceAdapter {
  publish(input: MarketplacePublishInput): Promise<MarketplacePublishResult>;
  delist(externalPlatformId: string): Promise<void>;
}

export const MARKETPLACE_ADAPTERS = Symbol('MARKETPLACE_ADAPTERS');
export type MarketplaceAdapterRegistry = Map<string, MarketplaceAdapter>;
