import { Injectable } from '@nestjs/common';
import {
  LogisticsProfile,
  SHIPPING_PORTAL_KEYS,
  shippingCostEur,
  shippingPortalsAllowed,
} from '../../domain/logistics/logistics-profile';

/**
 * Disposition Engine ("Lohnt sich das?", Freeze §10 / Zusammenfassung §3-III).
 * Reine, zustandslose Berechnung — keine DB-Zugriffe. Adaptiert aus
 * `docs/disposition_engine_decision_matrix.md`, an das V2.2-Vokabular
 * angepasst (Produktzustand als String passend zu `items.condition`).
 *
 * Feature-Plan 3.5: Versandportale und der Versandabzug kommen aus dem
 * Logistikprofil. Die frühere Ja/Nein-Sperrig-Flagge und die pauschalen
 * 1,50 € sind hier nicht mehr die Quelle.
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
  logistics: LogisticsProfile;
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
  /** 0 € bei Abholung oder ohne Profil. Sonst die Paketannahme aus Gewicht und Maßen. */
  shippingCostEur: number;
}

const LOW_VALUE_THRESHOLD_EUR = 10;
const BUYBACK_CATEGORIES = ['electronics', 'books', 'media'];

@Injectable()
export class DispositionEngineService {
  evaluate(product: ProductProfile): DispositionRecommendation {
    const marketPrice = product.marketMedianPrice;
    const parcelShippingEur = shippingCostEur(product.logistics);

    if (marketPrice < LOW_VALUE_THRESHOLD_EUR && product.condition !== 'new') {
      return {
        action: 'DONATE',
        recommendedPlatforms: [],
        rationale: `Der geschätzte Marktwert liegt bei ca. ${marketPrice.toFixed(2)} €. Im Verhältnis zum Aufwand (Verpackung, Postweg, Rückfragen) lohnt sich ein Online-Verkauf ökonomisch kaum. Empfehlung: Spende oder Wertstoffhof.`,
        estimatedEffortMinutes: 5,
        shippingCostEur: parcelShippingEur,
      };
    }

    // Feature-Plan 2.3: ein illustrativer Portal-Quote (Momox-Mock) wird
    // hier bewusst nicht gelesen. Diese Ankauf-Empfehlung hängt nur an
    // Kategorie und Verkaufsziel, nicht an der Platzhalterzahl.
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
          shippingCostEur: parcelShippingEur,
        };
      }
    }

    const ship = shippingPortalsAllowed(product.logistics);
    const postalCode = product.logistics.postalCode?.trim();
    const pickupWhere = postalCode ? ` in ${postalCode}` : '';
    const platforms: PlatformRecommendation[] = [
      {
        key: 'KLEINANZEIGEN',
        netExpectedValue: roundMoney(marketPrice - (ship ? parcelShippingEur : 0)),
        reasoning: ship
          ? `Versand möglich. Paketkosten ${parcelShippingEur.toFixed(2)} € aus Gewicht und Maßen.`
          : product.logistics.captured
            ? `Nur Abholung${pickupWhere}. Kein Versandportal.`
            : 'Ohne Logistikprofil nur Kleinanzeigen, ohne Versandpauschale.',
      },
    ];

    if (ship) {
      for (const key of SHIPPING_PORTAL_KEYS) {
        platforms.push({
          key,
          netExpectedValue: roundMoney(marketPrice - parcelShippingEur),
          reasoning: 'Versandportal. Gewicht und Maße passen ins Paket.',
        });
      }
    }

    return {
      action: product.logistics.captured && !ship ? 'LOCAL_PICKUP_ONLY' : 'SELL_ONLINE',
      recommendedPlatforms: platforms,
      rationale: ship
        ? `Versand ist möglich. Die Kanäle rechnen mit ${parcelShippingEur.toFixed(2)} € Paketkosten aus dem Logistikprofil.`
        : product.logistics.captured
          ? `Abholung${pickupWhere}. Versandportale entfallen: sperrig, nur Abholung oder kein Paket.`
          : `Basierend auf Ziel (${product.userGoal}) und Zustand (${product.condition}) bleibt Kleinanzeigen der Rat, solange kein Logistikprofil vorliegt.`,
      estimatedEffortMinutes: product.logistics.captured && !ship ? 15 : 25,
      shippingCostEur: parcelShippingEur,
    };
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
