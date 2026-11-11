import { Injectable } from '@nestjs/common';
import { SalesGoal } from '../../domain/ai/description-generation-provider.interface';
import { MIN_MARKET_SAMPLE_SIZE } from '../../domain/pricing/market-distribution-provider.interface';
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

/** Sichtbarer Hinweis neben P_list, P_target und P_min (Feature 2.7). */
export const ASKING_PRICE_NOTE = `Angebotspreise, nicht erzielte Verkäufe, Faktor ${ASKING_TO_REALIZED_FACTOR.toFixed(2).replace('.', ',')}`;

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
 * Momox ist ein Mock (Feature-Plan 2.3). Solange die Quelle als Beispiel
 * gekennzeichnet ist — explizit oder über das „(Mock)“ im Label —, darf
 * ihre Zahl die Schmerzgrenze nicht anheben und keinen Ankauf empfehlen.
 */
function isIllustrativeMarket(source: PriceResearchSourceResult): boolean {
  if (source.detail?.illustrative === true) return true;
  return /\(Mock\)/i.test(source.providerLabel);
}

function isIllustrativeBuyback(source: PriceResearchSourceResult): boolean {
  if (source.source !== 'ANKAUF_PORTAL') return false;
  if (source.detail?.illustrative === true) return true;
  return /\(Mock\)/i.test(source.providerLabel);
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
      (s) =>
        (s.source === 'EBAY_ACTIVE_LISTINGS' || s.source === 'GEMINI_GROUNDING') &&
        !isIllustrativeMarket(s),
    );
    if (marketSources.length === 0) return null;

    const reasoning: string[] = [];

    const totalSamples = marketSources.reduce((sum, s) => sum + s.sampleSize, 0);
    if (totalSamples <= 0) return null;

    const weightedMedian =
      marketSources.reduce((sum, s) => sum + (s.median ?? 0) * s.sampleSize, 0) / totalSamples;
    const { rangeLow, rangeHigh } = askingPriceSpan(marketSources, weightedMedian);
    const startPriceRecommended = totalSamples >= MIN_MARKET_SAMPLE_SIZE;

    reasoning.push(
      `Stichprobengröße: ${totalSamples}. Spanne ${rangeLow.toFixed(2)}–${rangeHigh.toFixed(2)} €. ${ASKING_PRICE_NOTE}.`,
    );

    const estimatedRealized = weightedMedian * ASKING_TO_REALIZED_FACTOR;
    const band = STRATEGY_BANDS[salesGoal ?? 'BALANCED'];
    const targetPrice = round2(estimatedRealized);
    const listPrice = round2(estimatedRealized * (1 + band.markup));
    let minPrice = round2(estimatedRealized * (1 - band.discount));

    if (startPriceRecommended) {
      reasoning.push(
        `Gewichteter Median aus ${marketSources.length} Quelle(n) (${totalSamples} Vergleichsangebote insgesamt): ${weightedMedian.toFixed(2)} €.`,
      );
      reasoning.push(
        `Angebotspreise liegen erfahrungsgemäß über tatsächlich erzielten Preisen (keine echten Sold-Daten verfügbar) — Schätzfaktor ×${ASKING_TO_REALIZED_FACTOR} ergibt einen realistischeren Zielanker von ${estimatedRealized.toFixed(2)} €.`,
      );
      reasoning.push(
        `Verkaufsziel ${salesGoal ?? 'BALANCED'}: Startpreis +${Math.round(band.markup * 100)}%, Schmerzgrenze -${Math.round(band.discount * 100)}%.`,
      );
    } else {
      reasoning.push('Unter fünf Vergleichen wird kein konkreter Startpreis empfohlen, nur die Spanne.');
    }

    const buybackSource = sources.find((s) => s.source === 'ANKAUF_PORTAL');
    const illustrativeBuyback = buybackSource != null && isIllustrativeBuyback(buybackSource);
    const buybackRecommended =
      !illustrativeBuyback &&
      buybackSource?.median != null &&
      buybackSource.median >= BUYBACK_RECOMMENDATION_THRESHOLD * targetPrice;
    if (illustrativeBuyback && buybackSource) {
      if (startPriceRecommended) {
        reasoning.push(
          `Ankaufsalternative (${buybackSource.providerLabel}) ist nur ein Beispiel und fließt weder in die Schmerzgrenze noch in eine Ankauf-Empfehlung ein.`,
        );
      }
    } else if (buybackSource?.median != null) {
      minPrice = Math.max(minPrice, buybackSource.median);
      if (startPriceRecommended) {
        reasoning.push(
          `Ankaufsalternative (${buybackSource.providerLabel}): ${buybackSource.median.toFixed(2)} €${
            buybackRecommended ? ' — liegt nah am Zielpreis, ggf. einfacher als ein Verkauf.' : '.'
          }`,
        );
      }
    }

    const confidence: PriceConfidence =
      totalSamples >= HIGH_CONFIDENCE_SAMPLE_SIZE
        ? 'HIGH'
        : totalSamples >= MEDIUM_CONFIDENCE_SAMPLE_SIZE
          ? 'MEDIUM'
          : 'LOW';
    reasoning.push(`Konfidenz: ${confidence} (basierend auf ${totalSamples} Vergleichsangeboten).`);

    return {
      listPrice,
      targetPrice,
      minPrice,
      confidence,
      buybackRecommended,
      reasoning,
      sampleSize: totalSamples,
      rangeLow,
      rangeHigh,
      startPriceRecommended,
      priceBasisNote: ASKING_PRICE_NOTE,
    };
  }
}

/** Sichtbare Spanne: niedrigstes p25 bis höchstes p75, nicht ein neuer Perzentil-Mix. */
function askingPriceSpan(
  sources: PriceResearchSourceResult[],
  fallback: number,
): { rangeLow: number; rangeHigh: number } {
  const lows = sources
    .map((s) => s.p25 ?? s.median)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const highs = sources
    .map((s) => s.p75 ?? s.median)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const low = lows.length > 0 ? Math.min(...lows) : fallback;
  const high = highs.length > 0 ? Math.max(...highs) : fallback;
  return { rangeLow: round2(Math.min(low, high)), rangeHigh: round2(Math.max(low, high)) };
}
