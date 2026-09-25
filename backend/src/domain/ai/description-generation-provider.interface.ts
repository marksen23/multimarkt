/**
 * Provider-Abstraktion für Beschreibungs-Generierung (docs/README.md §9b).
 * Bewusst nur ein VORSCHLAG: der Aufrufer (Controller/Frontend) zeigt den
 * Text in einem editierbaren Feld, nie eine stille Direktübernahme in
 * `canonical_listings` ohne die Möglichkeit, ihn vorher zu sehen/ändern.
 */
export interface DescriptionAttribute {
  key: string;
  value: string | null;
}

export interface ComparableListingRef {
  title: string;
  price: number;
}

/** Dieselbe Vokabel wie DispositionEngineService.DispositionUserGoal — steuert nur den Ton, nie die Fakten. */
export type SalesGoal = 'MAX_PROFIT' | 'BALANCED' | 'FAST_SALE' | 'MINIMAL_EFFORT';

export interface DescriptionGenerationInput {
  title: string | null;
  condition: string | null;
  attributes: DescriptionAttribute[];
  /**
   * §9e-Ergänzung (September 2026): echte Vergleichsangebote aus der
   * Gemini-Grounding-Preisrecherche (PriceTriangulationService) — die
   * einzige tatsächlich vorhandene "Konkurrenzanalyse"-Datenquelle. KEINE
   * Verkaufsperformance-Daten (kein sold/nicht-sold, keine View-Zahlen),
   * nur Titel+Preis aktiver Angebote — der Prompt darf das nur als
   * Formulierungs-Inspiration nutzen, nie als Tatsachenquelle für das
   * eigene Produkt.
   */
  comparableListings: ComparableListingRef[];
  salesGoal: SalesGoal | null;
}

export interface DescriptionGenerationProvider {
  /** Liefert `null`, wenn kein Vorschlag erzeugt werden konnte (Aufrufer fällt auf eine einfache Vorlage zurück). */
  generate(input: DescriptionGenerationInput): Promise<string | null>;
}

export const DESCRIPTION_GENERATION_PROVIDER = Symbol('DESCRIPTION_GENERATION_PROVIDER');
