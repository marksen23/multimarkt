import { Injectable } from '@nestjs/common';
import { SalesGoal } from '../../domain/ai/description-generation-provider.interface';
import { PriceRecommendation } from '../../domain/pricing/price-recommendation';
import { PriceResearchSourceResult } from '../pricing/price-triangulation.service';

export type PriceTier = 'BELOW_MARKET' | 'MARKET' | 'ABOVE_MARKET' | 'PREMIUM';

export type AlignmentIssueType =
  | 'HIGH_PRICE_WEAK_DESCRIPTION'
  | 'VALUE_SIGNALS_MISSING'
  | 'CONDITION_PRICE_INCONSISTENCY'
  | 'DEFECTIVE_ABOVE_MEDIAN';

export interface PriceAlignmentIssue {
  type: AlignmentIssueType;
  severity: 'WARNING' | 'INFO';
  message: string;
}

export interface PriceDescriptionAlignment {
  /** 0–100: Wie gut passt die Beschreibungssprache zum Preispunkt? */
  alignmentScore: number;
  /** Einordnung des Startpreises relativ zum Marktmedian. */
  priceTier: PriceTier;
  issues: PriceAlignmentIssue[];
  /**
   * Signalwörter die den Preis besser begründen würden, aber in der
   * Beschreibung fehlen. Nur bei ABOVE_MARKET/PREMIUM relevant.
   */
  missingValueSignals: string[];
}

interface ValueSignal {
  pattern: RegExp;
  label: string;
}

// Signalwörter die einen höheren Preis rechtfertigen
const VALUE_SIGNALS: ValueSignal[] = [
  { pattern: /\brechnung\b/i, label: 'Kaufbeleg/Rechnung vorhanden' },
  { pattern: /\bgarantie\b/i, label: 'Garantie noch gültig' },
  { pattern: /\bovp\b/i, label: 'Originalverpackung (OVP)' },
  { pattern: /\boriginalverpackung\b/i, label: 'Originalverpackung' },
  { pattern: /\bnp\s*:\s*\d/i, label: 'Neupreis angegeben (NP:)' },
  { pattern: /\buvp\s*:\s*\d/i, label: 'UVP angegeben' },
  { pattern: /\b(kaum|selten)\s+(benutzt|getragen|verwendet|gebraucht)\b/i, label: 'Selten benutzt' },
  { pattern: /\b(1|ein|eine)\s*x?\s*(mal\s+)?(benutzt|getragen|verwendet|gebraucht)\b/i, label: 'Einmal benutzt' },
  { pattern: /\bzubehör\b.*\bbei\b|\bbox\b.*\bbei\b|\boriginal\s+zubehör\b/i, label: 'Zubehör / Box inklusive' },
  { pattern: /\bneuwertig\b/i, label: 'Als neuwertig beschrieben' },
  { pattern: /\blimitiert\b|\blimited\s+edition\b|\bsonderedition\b/i, label: 'Limitierte Edition' },
];

/**
 * Bewertet ob die Sprache der Beschreibung zum Preispunkt passt (Oktober 2026).
 * Prüft: Preis-Tier vs. Wert-Signale in der Beschreibung, Zustand-Preis-Konsistenz.
 * Deterministisch (keine KI), kann aber null liefern wenn keine Marktdaten vorliegen.
 */
@Injectable()
export class PriceDescriptionAlignmentService {
  evaluate(
    descriptionText: string,
    recommendation: PriceRecommendation,
    sources: PriceResearchSourceResult[],
    condition: string | null,
  ): PriceDescriptionAlignment | null {
    const marketSources = sources.filter(
      (s) => s.source === 'EBAY_ACTIVE_LISTINGS' || s.source === 'GEMINI_GROUNDING',
    );

    if (marketSources.length === 0) return null;

    const totalSamples = marketSources.reduce((sum, s) => sum + s.sampleSize, 0);
    if (totalSamples === 0) return null;

    const weightedMedian =
      marketSources.reduce((sum, s) => sum + (s.median ?? 0) * s.sampleSize, 0) / totalSamples;
    const weightedP75 =
      marketSources.reduce((sum, s) => sum + (s.p75 ?? s.median ?? 0) * s.sampleSize, 0) / totalSamples;
    const weightedP25 =
      marketSources.reduce((sum, s) => sum + (s.p25 ?? s.median ?? 0) * s.sampleSize, 0) / totalSamples;

    const listPrice = recommendation.listPrice;

    const priceTier = this.classifyPriceTier(listPrice, weightedMedian, weightedP25, weightedP75);

    const presentSignals = VALUE_SIGNALS.filter((s) => s.pattern.test(descriptionText));
    const missingSignals = VALUE_SIGNALS.filter((s) => !s.pattern.test(descriptionText));

    let score = 100;
    const issues: PriceAlignmentIssue[] = [];

    if (priceTier === 'PREMIUM') {
      if (presentSignals.length < 2) {
        score -= 30;
        issues.push({
          type: 'HIGH_PRICE_WEAK_DESCRIPTION',
          severity: 'WARNING',
          message: `Startpreis (${listPrice.toFixed(2)} €) liegt deutlich über dem Marktmedian (${weightedMedian.toFixed(2)} €). Die Beschreibung enthält kaum Wertmerkmale, die diesen Premium-Preis begründen.`,
        });
      } else if (presentSignals.length < 3) {
        score -= 10;
        issues.push({
          type: 'VALUE_SIGNALS_MISSING',
          severity: 'INFO',
          message: `Premium-Preis erkannt. Weitere Wertmerkmale in der Beschreibung könnten die Verhandlungsposition stärken.`,
        });
      }
    } else if (priceTier === 'ABOVE_MARKET' && presentSignals.length < 1) {
      score -= 15;
      issues.push({
        type: 'VALUE_SIGNALS_MISSING',
        severity: 'INFO',
        message: `Preis liegt über dem Marktmedian (${weightedMedian.toFixed(2)} €). Mindestens ein Wertmerkmal (Garantie, OVP, selten genutzt, Rechnung) würde den Preis besser begründen.`,
      });
    }

    // Zustand-Preis-Konsistenz
    if (condition === 'defective' && (priceTier === 'ABOVE_MARKET' || priceTier === 'PREMIUM')) {
      score -= 25;
      issues.push({
        type: 'DEFECTIVE_ABOVE_MEDIAN',
        severity: 'WARNING',
        message: `Zustand ist "defekt", aber der Preis liegt über dem Marktmedian. Käufer erwarten bei Defekten einen deutlichen Abschlag.`,
      });
    } else if (condition === 'fair' && priceTier === 'PREMIUM') {
      score -= 15;
      issues.push({
        type: 'CONDITION_PRICE_INCONSISTENCY',
        severity: 'WARNING',
        message: `Zustand "fair" (sichtbare Gebrauchsspuren) und ein Premium-Preis passen selten zusammen. Beschreibung oder Preis anpassen.`,
      });
    }

    // Fehlende Wert-Signale nur bei über-Median Preisen ausgeben (max. 5)
    const relevantMissing =
      priceTier === 'BELOW_MARKET' || priceTier === 'MARKET'
        ? []
        : missingSignals.slice(0, 5).map((s) => s.label);

    return {
      alignmentScore: Math.max(0, score),
      priceTier,
      issues,
      missingValueSignals: relevantMissing,
    };
  }

  private classifyPriceTier(
    listPrice: number,
    median: number,
    p25: number,
    p75: number,
  ): PriceTier {
    if (listPrice > p75 * 1.1) return 'PREMIUM';
    if (listPrice > median * 1.05) return 'ABOVE_MARKET';
    if (listPrice < p25 * 0.9) return 'BELOW_MARKET';
    return 'MARKET';
  }
}
