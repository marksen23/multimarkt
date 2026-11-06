/**
 * Abgeleiteter Preisvorschlag (§9e-Erweiterung, September 2026 — Antwort
 * auf die Preisfindungs-Methodik-Anfrage). Ergänzt die bestehende,
 * per-Quelle getrennte Preisrecherche um EINE zusätzliche, transparent
 * begründete Zusammenfassung — ersetzt die Einzelquellen-Anzeige nicht
 * (§9d Punkt 3: Quellen nie zu einer Blackbox-Zahl vermischen).
 *
 * BEWUSST NICHT umgesetzt, aus der Methodik-Vorlage: die dortigen
 * γ(Zustand)/δ(Alter)/κ(Vollständigkeit)-Anpassungsfaktoren sind relativ
 * zu einem Neupreis-Anker (P_new) definiert, den dieses System nicht hat
 * (keine Idealo/Amazon-Anbindung) — sie auf Angebots-Mediane anzuwenden,
 * die bereits über eine zustandsgefilterte Suche entstanden sind, würde
 * den Zustand doppelt einpreisen. δ(Alter) und κ(Vollständigkeit) brauchen
 * zusätzlich Daten (Kaufdatum, OVP/Zubehör-Flag), die im Schema nicht
 * existieren — beides zu erfinden würde "Never silently invent" verletzen.
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
}
