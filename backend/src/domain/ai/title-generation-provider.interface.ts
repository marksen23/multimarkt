import { ComparableListingRef } from './description-generation-provider.interface';

/**
 * Provider-Abstraktion für Titel-Generierung (§9e-Ergänzung, September
 * 2026, Antwort auf die Methodik-Anfrage zu verkaufsziel-optimierten
 * Angebotstexten). Bewusst nur ein VORSCHLAG wie bei der
 * Beschreibungs-Generierung — der Aufrufer zeigt den Text editierbar an,
 * nie eine stille Direktübernahme.
 */
export type ListingChannel = 'KLEINANZEIGEN' | 'EBAY' | 'VINTED';

// Plattform-Längenlimits aus der Methodik-Vorlage (Kleinanzeigen Basic
// ~65 Zeichen sichtbar, eBay großzügiger, Vinted kanaltypisch kurz) —
// grobe, dokumentierte Richtwerte, keine exakte Plattformspezifikation.
export const CHANNEL_TITLE_LIMITS: Record<ListingChannel, number> = {
  KLEINANZEIGEN: 65,
  EBAY: 80,
  VINTED: 70,
};

export interface TitleAttribute {
  key: string;
  value: string | null;
}

export interface TitleGenerationInput {
  title: string | null;
  condition: string | null;
  attributes: TitleAttribute[];
  channel: ListingChannel;
  /**
   * Dieselbe Datenquelle wie bei der Beschreibungs-Generierung (echte
   * Vergleichsangebote aus der Gemini-Grounding-Preisrecherche) — hier
   * zusätzlich als Vokabular-/Token-Vorbild für die Titel-Lückenanalyse
   * genutzt (Abschnitt 2.3 der Methodik-Anfrage), NIE als Faktenquelle.
   */
  comparableListings: ComparableListingRef[];
}

export interface TitleGenerationProvider {
  /** Liefert `null`, wenn kein Vorschlag erzeugt werden konnte. */
  generate(input: TitleGenerationInput): Promise<string | null>;
}

export const TITLE_GENERATION_PROVIDER = Symbol('TITLE_GENERATION_PROVIDER');
