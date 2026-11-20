/**
 * Abgeleiteter Preisvorschlag (§9e-Erweiterung, September 2026 — Antwort
 * auf die Preisfindungs-Methodik-Anfrage). Ergänzt die bestehende,
 * per-Quelle getrennte Preisrecherche um EINE zusätzliche, transparent
 * begründete Zusammenfassung — ersetzt die Einzelquellen-Anzeige nicht
 * (§9d Punkt 3: Quellen nie zu einer Blackbox-Zahl vermischen).
 *
 * Der Zustand wird einmal angepasst (condition-adjustment.ts), weil die
 * Suche alle gebrauchten Zustände mischt und nicht schon auf genau diesen
 * Zustand gefiltert ist. Alter und Vollständigkeit bleiben außen vor:
 * Kaufdatum und ein belastbares Zubehör-Flag gibt es nicht.
 */
export type PriceConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface PriceRecommendation {
  listPrice: number;
  targetPrice: number;
  minPrice: number;
  confidence: PriceConfidence;
  buybackRecommended: boolean;
  /** Menschenlesbare Begründungskette — jeder Schritt nachvollziehbar, keine Blackbox. */
  reasoning: string[];
  /** Vergleichsangebote über alle Marktquellen, ohne den Ankaufsanker. */
  sampleSize: number;
  /** Untere Grenze der Spanne (niedrigstes p25 der Marktquellen). */
  rangeLow: number;
  /** Obere Grenze der Spanne (höchstes p75 der Marktquellen). */
  rangeHigh: number;
  /**
   * Unter fünf Vergleichen false: `listPrice` ist dann keine Empfehlung.
   * Sichtbar bleiben Stichprobengröße, Spanne und `priceBasisNote`.
   */
  startPriceRecommended: boolean;
  /** Fester Hinweis: Angebotspreise, nicht erzielte Verkäufe, Faktor 0,87. */
  priceBasisNote: string;
  /**
   * Preis für einen schnellen Verkauf. Hängt nicht am Verkaufsziel:
   * Median der Angebote, mal Zustandsfaktor, mal 0,87.
   */
  quickSalePrice: number;
  /** 1 bei unbekanntem oder gutem Zustand. */
  conditionFactor: number;
  /** Deutscher Satz zum Zustandsfaktor. */
  conditionNote: string;
  /** Deutscher Satz, warum die Konfidenz so ist. */
  confidenceNote: string;
}
