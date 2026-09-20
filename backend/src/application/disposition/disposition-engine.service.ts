import { Injectable } from '@nestjs/common';

/**
 * Disposition Engine ("Lohnt sich das?", Freeze §10 / Zusammenfassung §3-III).
 * Reine, zustandslose Berechnung — keine DB-Zugriffe. Adaptiert aus
 * `docs/disposition_engine_decision_matrix.md`, an das V2.2-Vokabular
 * angepasst (Produktzustand als String passend zu `items.condition`).
 */

export type DispositionAction =
  | 'SELL_ONLINE'
  | 'LOCAL_PICKUP_ONLY'
  | 'DONATE'
  | 'DISCARD'
  | 'BUYBACK_SERVICE';

export type DispositionUserGoal = 'MAX_PROFIT' | 'BALANCED' | 'FAST_SALE' | 'MINIMAL_EFFORT';

export interface ProductProfile {
  id: string;
  category: string;
  condition: string;
  marketMedianPrice: number;
  isBulky: boolean;
  userGoal: DispositionUserGoal;
}

export interface PlatformRecommendation {
  key: string;
  netExpectedValue: number;
  reasoning: string;
}

export interface DispositionRecommendation {
  action: DispositionAction;
  recommendedPlatforms: PlatformRecommendation[];
  rationale: string;
  estimatedEffortMinutes: number;
}

const LOW_VALUE_THRESHOLD_EUR = 10;
const BUYBACK_CATEGORIES = ['electronics', 'books', 'media'];
const FASHION_CATEGORIES = ['fashion', 'shoes'];

@Injectable()
export class DispositionEngineService {
  evaluate(product: ProductProfile): DispositionRecommendation {
    const marketPrice = product.marketMedianPrice;

    if (marketPrice < LOW_VALUE_THRESHOLD_EUR && product.condition !== 'new') {
      return {
        action: 'DONATE',
        recommendedPlatforms: [],
        rationale: `Der geschätzte Marktwert liegt bei ca. ${marketPrice.toFixed(2)} €. Im Verhältnis zum Aufwand (Verpackung, Postweg, Rückfragen) lohnt sich ein Online-Verkauf ökonomisch kaum. Empfehlung: Spende oder Wertstoffhof.`,
        estimatedEffortMinutes: 5,
      };
    }

    if (BUYBACK_CATEGORIES.includes(product.category)) {
      const estimatedBuybackPrice = marketPrice * 0.4;
      if (product.userGoal === 'FAST_SALE' || product.userGoal === 'MINIMAL_EFFORT') {
        return {
          action: 'BUYBACK_SERVICE',
          recommendedPlatforms: [
            {
              key: 'BUYBACK_SERVICE',
              netExpectedValue: estimatedBuybackPrice,
              reasoning: 'Sofortankauf ohne Käuferkommunikation und Versandrisiko.',
            },
          ],
          rationale:
            'Da ein schneller Verkauf ohne Aufwand gewünscht ist, ist ein Direktankaufsdienst die effizienteste Wahl.',
          estimatedEffortMinutes: 10,
        };
      }
    }

    const platforms: PlatformRecommendation[] = [];

    if (!product.isBulky) {
      platforms.push({
        key: 'EBAY',
        netExpectedValue: marketPrice * 0.95 - 2.5,
        reasoning: 'Maximale bundesweite Reichweite für den Versandverkauf.',
      });
    }

    platforms.push({
      key: 'KLEINANZEIGEN',
      netExpectedValue: marketPrice * 1.0 - (product.isBulky ? 0 : 1.5),
      reasoning: 'Ideal für lokale Abholung (kein Versandaufwand) oder schnelle Käufer.',
    });

    if (FASHION_CATEGORIES.includes(product.category)) {
      platforms.push({
        key: 'VINTED',
        netExpectedValue: marketPrice,
        reasoning: 'Passende Zielgruppe für Mode; Käufer zahlt die Käuferschutzgebühr, nicht der Verkäufer.',
      });
    }

    platforms.sort((a, b) => b.netExpectedValue - a.netExpectedValue);

    return {
      action: product.isBulky ? 'LOCAL_PICKUP_ONLY' : 'SELL_ONLINE',
      recommendedPlatforms: platforms,
      rationale: `Basierend auf Ziel (${product.userGoal}) und Zustand (${product.condition}) erzielt dieser Artikel den besten Nettoerlös über die aufgeführten Kanäle.`,
      estimatedEffortMinutes: product.isBulky ? 15 : 25,
    };
  }
}
