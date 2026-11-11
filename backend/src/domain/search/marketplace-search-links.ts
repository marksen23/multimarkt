import type { AnkaufSearchPlace } from '../ankauf/search-place';

export const SEARCH_LINK_PLATFORMS = ['KLEINANZEIGEN', 'EBAY', 'VINTED', 'FACEBOOK'] as const;

export type SearchLinkPlatform = (typeof SEARCH_LINK_PLATFORMS)[number];

export interface MarketplaceSearchLink {
  platform: SearchLinkPlatform;
  label: string;
  url: string;
  /** Einschränkung der Plattform, z. B. kein PLZ-Filter. */
  note: string | null;
}

const EBAY_DISTANCE_STEPS = [5, 10, 25, 50, 75, 100, 150, 200, 500];

/**
 * Öffnet die Suche auf der Plattform. Kein Abruf und kein Scraping —
 * der Nutzer folgt dem Link selbst.
 */
export function marketplaceSearchLinks(
  keywords: string,
  place?: AnkaufSearchPlace | null,
): MarketplaceSearchLink[] {
  const query = keywords.trim();
  if (!query) return [];
  const encoded = encodeURIComponent(query);
  const postalCode = place && /^\d{5}$/.test(place.postalCode) ? place.postalCode : null;
  const radiusKm = place?.radiusKm;

  const kleinanzeigen = new URL('https://www.kleinanzeigen.de/s-suchanfrage.html');
  kleinanzeigen.searchParams.set('keywords', query);
  if (postalCode) {
    kleinanzeigen.searchParams.set('locationStr', postalCode);
    if (radiusKm) kleinanzeigen.searchParams.set('radius', String(radiusKm));
  }

  const ebay = new URL('https://www.ebay.de/sch/i.html');
  ebay.searchParams.set('_nkw', query);
  ebay.searchParams.set('_sacat', '0');
  // 4 = Gebraucht auf der ebay.de-Suchseite (nicht die Browse-API-IDs).
  ebay.searchParams.set('LH_ItemCondition', '4');
  ebay.searchParams.set('rt', 'nc');
  if (postalCode && radiusKm) {
    ebay.searchParams.set('_stpos', postalCode);
    ebay.searchParams.set('_sadis', String(nearestEbayDistance(radiusKm)));
  }

  return [
    {
      platform: 'KLEINANZEIGEN',
      label: 'Kleinanzeigen',
      url: kleinanzeigen.toString(),
      note: postalCode ? null : 'Ohne PLZ, deutschlandweit.',
    },
    {
      platform: 'EBAY',
      label: 'eBay',
      url: ebay.toString(),
      note: postalCode ? 'Gebraucht, Umkreis um die PLZ.' : 'Gebraucht, ohne Umkreis.',
    },
    {
      platform: 'VINTED',
      label: 'Vinted',
      url: `https://www.vinted.de/catalog?search_text=${encoded}`,
      note: 'Vinted filtert hier nicht nach PLZ.',
    },
    {
      platform: 'FACEBOOK',
      label: 'Facebook',
      url: `https://www.facebook.com/marketplace/search/?query=${encoded}`,
      note: 'Facebook nutzt den Standort des Kontos, nicht die PLZ.',
    },
  ];
}

function nearestEbayDistance(radiusKm: number): number {
  return EBAY_DISTANCE_STEPS.reduce((best, step) =>
    Math.abs(step - radiusKm) < Math.abs(best - radiusKm) ? step : best,
  );
}
