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

export interface DescriptionGenerationInput {
  title: string | null;
  condition: string | null;
  attributes: DescriptionAttribute[];
}

export interface DescriptionGenerationProvider {
  /** Liefert `null`, wenn kein Vorschlag erzeugt werden konnte (Aufrufer fällt auf eine einfache Vorlage zurück). */
  generate(input: DescriptionGenerationInput): Promise<string | null>;
}

export const DESCRIPTION_GENERATION_PROVIDER = Symbol('DESCRIPTION_GENERATION_PROVIDER');
