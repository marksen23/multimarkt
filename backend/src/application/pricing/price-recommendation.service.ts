import { Injectable } from '@nestjs/common';
import { SalesGoal } from '../../domain/ai/description-generation-provider.interface';
import { PriceConfidence, PriceRecommendation } from '../../domain/pricing/price-recommendation';
import { PriceResearchSourceResult } from './price-triangulation.service';

// §9e: Angebotspreise liegen systematisch über tatsächlich erzielten
// Preisen (Methodik-Vorlage Abschnitt 4.2) — ohne echten Zugriff auf
// eBay-Sold-Daten (siehe RealGeminiGroundingProvider-Kommentar: die
// Finding-API mit Completed-Listings ist nicht mehr frei verfügbar) bleibt
// nur diese dokumentierte Näherung. Mittelwert des in der Vorlage
// genannten Bereichs (0,82–0,92) als Startwert, bewusst als benannte
// Konstante statt versteckt in einer Formel (gleiches Prinzip wie
// BUYBACK_TO_RESALE_MULTIPLIER).
export const ASKING_TO_REALIZED_FACTOR = 0.87;

// §9e: grobe Verkaufsziel-Strategie (Markup fürs Startgebot / Abschlag für
// die Schmerzgrenze), angelehnt an die Methodik-Vorlage Abschnitt 4.4.
// MINIMAL_EFFORT ist dort nicht vorgesehen (nur schnell/normal/maximieren)
// — hier bewusst nah an BALANCED gehalten, da "minimaler Aufwand" eine
// Frage der Formulierung ist (siehe Beschreibungs-Generator), nicht des
// Preises.
const STRATEGY_BANDS: Record<SalesGoal, { markup: number; discount: number }> = {
  FAST_SALE: { markup: 0, discount: 0.12 },
  BALANCED: { markup: 0.08, discount: 0.08 },
  MAX_PROFIT: { markup: 0.16, discount: 0.045 },
  MINIMAL_EFFORT: { markup: 0.05, discount: 0.1 },
};

const HIGH_CONFIDENCE_SAMPLE_SIZE = 15;
const MEDIUM_CONFIDENCE_SAMPLE_SIZE = 5;

// §9e: Ankauf ist die günstigere Alternative, sobald er nah am Zielpreis
// liegt (Methodik-Vorlage Abschnitt 4.4: "Wenn P_buy > 0,85·P_target, ist
// Ankauf oft rational").
const BUYBACK_RECOMMENDATION_THRESHOLD = 0.85;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Reine, deterministische Berechnung — keine DB-/Netzwerk-Abhängigkeit,
 * bewusst getrennt von PriceTriangulationService (das holt/cached die
 * Rohdaten, das hier verdichtet sie nur). Liefert `null`, wenn keine
 * Markt-Verteilungsquelle (eBay/Grounding) Daten geliefert hat — ein
 * Ankaufspreis allein ist kein Verkaufspreis-Vorschlag.
 */
@Injectable()
export class PriceRecommendationService {
  recommend(
    sources: PriceResearchSourceResult[],
    salesGoal: SalesGoal | null,
  ): PriceRecommendation | null {
    const marketSources = sources.filter(
      (s) => s.source === 'EBAY_ACTIVE_LISTINGS' || s.source === 'GEMINI_GROUNDING',
    );
    if (marketSources.length === 0) return null;

    const reasoning: string[] = [];

    const totalSamples = marketSources.reduce((sum, s) => sum + s.sampleSize, 0);
    const weightedMedian =
      marketSources.reduce((sum, s) => sum + (s.median ?? 0) * s.sampleSize, 0) / totalSamples;
    reasoning.push(
      `Gewichteter Median aus ${marketSources.length} Quelle(n) (${totalSamples} Vergleichsangebote insgesamt): ${weightedMedian.toFixed(2)} €.`,
    );

    const estimatedRealized = weightedMedian * ASKING_TO_REALIZED_FACTOR;
    reasoning.push(
      `Angebotspreise liegen erfahrungsgemäß über tatsächlich erzielten Preisen (keine echten Sold-Daten verfügbar) — Schätzfaktor ×${ASKING_TO_REALIZED_FACTOR} ergibt einen realistischeren Zielanker von ${estimatedRealized.toFixed(2)} €.`,
    );

    const band = STRATEGY_BANDS[salesGoal ?? 'BALANCED'];
    const targetPrice = round2(estimatedRealized);
    const listPrice = round2(estimatedRealized * (1 + band.markup));
    let minPrice = round2(estimatedRealized * (1 - band.discount));
    reasoning.push(
      `Verkaufsziel ${salesGoal ?? 'BALANCED'}: Startpreis +${Math.round(band.markup * 100)}%, Schmerzgrenze -${Math.round(band.discount * 100)}%.`,
    );

    const buybackSource = sources.find((s) => s.source === 'ANKAUF_PORTAL');
    const buybackRecommended =
      buybackSource?.median != null && buybackSource.median >= BUYBACK_RECOMMENDATION_THRESHOLD * targetPrice;
    if (buybackSource?.median != null) {
      minPrice = Math.max(minPrice, buybackSource.median);
      reasoning.push(
        `Ankaufsalternative (${buybackSource.providerLabel}): ${buybackSource.median.toFixed(2)} €${
          buybackRecommended ? ' — liegt nah am Zielpreis, ggf. einfacher als ein Verkauf.' : '.'
        }`,
      );
    }

    const confidence: PriceConfidence =
      totalSamples >= HIGH_CONFIDENCE_SAMPLE_SIZE
        ? 'HIGH'
        : totalSamples >= MEDIUM_CONFIDENCE_SAMPLE_SIZE
          ? 'MEDIUM'
          : 'LOW';
    reasoning.push(`Konfidenz: ${confidence} (basierend auf ${totalSamples} Vergleichsangeboten).`);

    return { listPrice, targetPrice, minPrice, confidence, buybackRecommended, reasoning };
  }
}
