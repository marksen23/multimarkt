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

    // Vertriebskanal-Entscheidung (docs/README.md §4e-Ergänzung, September
    // 2026): Kleinanzeigen ist der einzige Verkaufskanal — eBay/Vinted
    // werden hier bewusst nicht mehr als Plattform empfohlen (eBay dient
    // nur noch als Recherche-Quelle, siehe PriceTriangulationService).
    const platforms: PlatformRecommendation[] = [
      {
        key: 'KLEINANZEIGEN',
        netExpectedValue: marketPrice * 1.0 - (product.isBulky ? 0 : 1.5),
        reasoning: 'Einziger aktiver Verkaufskanal — ideal für lokale Abholung (kein Versandaufwand) oder schnelle Käufer.',
      },
    ];

    return {
      action: product.isBulky ? 'LOCAL_PICKUP_ONLY' : 'SELL_ONLINE',
      recommendedPlatforms: platforms,
      rationale: `Basierend auf Ziel (${product.userGoal}) und Zustand (${product.condition}) erzielt dieser Artikel den besten Nettoerlös über die aufgeführten Kanäle.`,
      estimatedEffortMinutes: product.isBulky ? 15 : 25,
    };
  }
}
