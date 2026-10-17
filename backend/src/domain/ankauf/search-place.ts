// Suchprofil der Ankauf-Recherche (Feature-Plan 2.6). Ort und Umkreis
// kommen vom Nutzer, nicht von einem festen Standort.

export const ANKAUF_RADIUS_OPTIONS_KM = [5, 10, 20, 30, 50, 100, 150, 200] as const;

export const DEFAULT_ANKAUF_RADIUS_KM = 20;

// Kurz halten: die Liste soll wiederfindbar sein, nicht ein Archiv.
export const ANKAUF_SEARCH_HISTORY_LIMIT = 8;

export interface AnkaufSearchPlace {
  postalCode: string;
  radiusKm: number;
}

export function isAnkaufRadiusKm(value: number): boolean {
  return (ANKAUF_RADIUS_OPTIONS_KM as readonly number[]).includes(value);
}

export function formatSearchLocation(postalCode: string, radiusKm: number): string {
  return `PLZ ${postalCode} (${radiusKm} km Umkreis)`;
}
