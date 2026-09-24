/**
 * Provider-Abstraktion für Bildoptimierung (docs/README.md §9e-Ergänzung,
 * September 2026: "Nano Banana"-Bildgenerierung/-bearbeitung). Bewusst
 * eigenständige Aktion, kein automatischer Ersatz des Originalfotos — der
 * Nutzer sieht Vorher/Nachher und entscheidet (§9d-Prinzip "keine
 * Automatik ohne Bestätigung" gilt auch für Bilder, nicht nur Preise).
 */
export interface OptimizeImageInput {
  buffer: Buffer;
  mimeType: string;
}

export interface OptimizeImageResult {
  buffer: Buffer;
  mimeType: string;
}

export interface ImageOptimizationProvider {
  /** Liefert `null`, wenn keine Optimierung erzeugt werden konnte — nie ein kaputtes/erfundenes Bild. */
  optimize(input: OptimizeImageInput): Promise<OptimizeImageResult | null>;
}

export const IMAGE_OPTIMIZATION_PROVIDER = Symbol('IMAGE_OPTIMIZATION_PROVIDER');
