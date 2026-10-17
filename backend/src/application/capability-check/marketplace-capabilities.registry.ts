/**
 * Fallback-Konfiguration je Marktplatz (Doc 03 §6, Doc 04 §15, Freeze §7
 * "Ebene A/B/C"). Welche Felder Pflicht sind, kommt aus der Kategorie
 * (domain/category/taxonomy.ts, Feature-Plan 3.9) — nicht mehr aus einer
 * festen Liste `category` + `brand`.
 *
 * Fehlt ein Pflichtfeld UND ist kein generischer Fallback erlaubt,
 * blockiert der CapabilityCheckService den Publish-Pfad hart (Ebene C).
 * Ist ein Fallback erlaubt, landet er ausschließlich in
 * `marketplace_projections.fallback_data` — niemals in
 * `item_attributes`/ProductTruth (Doc 03 §4 "Kein Fallback-Bleed").
 */
export interface MarketplaceCapabilityProfile {
  marketplaceId: string;
  /** attributeKey -> generischer Ersatzwert, der für dieses Feld erlaubt ist. */
  genericFallbacks: Record<string, string>;
}

export const MARKETPLACE_CAPABILITIES: Record<string, MarketplaceCapabilityProfile> = {
  EBAY: {
    marketplaceId: 'EBAY',
    genericFallbacks: { brand: 'Markenlos / Sonstige' },
  },
  KLEINANZEIGEN: {
    marketplaceId: 'KLEINANZEIGEN',
    genericFallbacks: {},
  },
};

export function getCapabilityProfile(marketplaceId: string): MarketplaceCapabilityProfile {
  const profile = MARKETPLACE_CAPABILITIES[marketplaceId];
  if (!profile) {
    throw new Error(`Unknown marketplace '${marketplaceId}' — no capability profile registered`);
  }
  return profile;
}
