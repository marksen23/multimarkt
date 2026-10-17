import { Injectable } from '@nestjs/common';
import { prefersBuyback } from '../../domain/category/taxonomy';
import {
  LogisticsProfile,
  SHIPPING_PORTAL_KEYS,
  shippingCostEur,
  shippingPortalsAllowed,
} from '../../domain/logistics/logistics-profile';
import {
  ChannelFeeAssumptions,
  SellingChannelKey,
  channelNetRemainingEur,
  comparisonShippingEur,
} from '../../domain/pricing/channel-fees';

/**
 * Disposition Engine ("Lohnt sich das?", Freeze §10 / Zusammenfassung §3-III).
 * Reine, zustandslose Berechnung — keine DB-Zugriffe. Adaptiert aus
 * `docs/disposition_engine_decision_matrix.md`, an das V2.2-Vokabular
 * angepasst (Produktzustand als String passend zu `items.condition`).
 *
 * Feature-Plan 3.5: Versandportale und der Versandabzug kommen aus dem
 * Logistikprofil. Die frühere Ja/Nein-Sperrig-Flagge und die pauschalen
 * 1,50 € sind hier nicht mehr die Quelle.
 *
 * Feature-Plan 3.10: Liegen Kanalgebühren vor, ist der Netto je Kanal
 * Verkaufspreis minus Prozent, Fixkosten und diesem Versand. Die Liste
 * sortiert nach diesem Netto, nicht nach dem Angebotsmedian. Ohne
 * Gebühren bleibt der bisherige Abzug (nur Versand aus dem Profil).
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
  /** Annahmen. Fehlen sie, zieht die Engine nur den Versand aus dem Profil ab. */
  channelFees?: ChannelFeeAssumptions | null;
  /** Versandpauschale aus den Annahmen. Über 0 € ersetzt sie die Paketkosten im Netto. */
  shippingFlatEur?: number | null;
}

export interface PlatformRecommendation {
  key: string;
  netExpectedValue: number;
  reasoning: string;
  /** null beim Ankauf und wenn keine Gebührenannahme übergeben wurde. */
  feePercent: number | null;
  feeFixedEur: number | null;
  /** Versand, der im Netto steckt. 0 bei Abholung. */
  shippingEur: number;
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
    // Feature-Plan 3.9: Elektronik und Medien, auch die früheren Schlüssel
    // electronics, books und media.
    if (prefersBuyback(product.category)) {
      const estimatedBuybackPrice = marketPrice * 0.4;
      if (product.userGoal === 'FAST_SALE' || product.userGoal === 'MINIMAL_EFFORT') {
        return {
          action: 'BUYBACK_SERVICE',
          recommendedPlatforms: [
            {
              key: 'BUYBACK_SERVICE',
              netExpectedValue: estimatedBuybackPrice,
              reasoning: 'Sofortankauf ohne Käuferkommunikation und Versandrisiko.',
              feePercent: null,
              feeFixedEur: null,
              shippingEur: 0,
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
    const fees = product.channelFees ?? null;
    const netShippingEur = fees
      ? comparisonShippingEur({
          shippingAllowed: ship,
          parcelEur: parcelShippingEur,
          flatEur: product.shippingFlatEur ?? 0,
        })
      : ship
        ? parcelShippingEur
        : 0;
    const kleinanzeigenShippingEur = netShippingEur;
    const platforms: PlatformRecommendation[] = [
      platformNet(
        marketPrice,
        'KLEINANZEIGEN',
        kleinanzeigenShippingEur,
        fees,
        ship
          ? `Versand möglich. Paketkosten ${parcelShippingEur.toFixed(2)} € aus Gewicht und Maßen.`
          : product.logistics.captured
            ? `Nur Abholung${pickupWhere}. Kein Versandportal.`
            : 'Ohne Logistikprofil nur Kleinanzeigen, ohne Versandpauschale.',
      ),
    ];

    if (ship) {
      for (const key of SHIPPING_PORTAL_KEYS) {
        platforms.push(
          platformNet(
            marketPrice,
            key,
            netShippingEur,
            fees,
            'Versandportal. Gewicht und Maße passen ins Paket.',
          ),
        );
      }
    }

    return {
      action: product.logistics.captured && !ship ? 'LOCAL_PICKUP_ONLY' : 'SELL_ONLINE',
      recommendedPlatforms: rankByNet(platforms),
      rationale: ship
        ? fees
          ? netShippingEur !== parcelShippingEur
            ? `Versand ist möglich. Im Netto steckt die Versandpauschale ${netShippingEur.toFixed(2)} € (Annahme). Die Reihenfolge folgt dem Netto nach Gebührenannahme, nicht dem Angebotsmedian.`
            : `Versand ist möglich. Paketkosten ${parcelShippingEur.toFixed(2)} € aus dem Logistikprofil. Die Reihenfolge folgt dem Netto nach Gebührenannahme, nicht dem Angebotsmedian.`
          : `Versand ist möglich. Die Kanäle rechnen mit ${parcelShippingEur.toFixed(2)} € Paketkosten aus dem Logistikprofil.`
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

const SELLING_RANK = ['KLEINANZEIGEN', 'EBAY', 'VINTED'];

function platformNet(
  marketPrice: number,
  key: SellingChannelKey,
  shippingEur: number,
  fees: ChannelFeeAssumptions | null,
  reasoning: string,
): PlatformRecommendation {
  const fee = fees?.[key] ?? null;
  return {
    key,
    netExpectedValue: fee
      ? channelNetRemainingEur(marketPrice, fee, shippingEur)
      : roundMoney(marketPrice - shippingEur),
    reasoning,
    feePercent: fee?.percent ?? null,
    feeFixedEur: fee?.fixedEur ?? null,
    shippingEur: roundMoney(shippingEur),
  };
}

/** Höchster Netto zuerst. Der Angebotsmedian ist für alle Kanäle derselbe. */
function rankByNet(platforms: PlatformRecommendation[]): PlatformRecommendation[] {
  return [...platforms].sort((a, b) => {
    if (a.netExpectedValue !== b.netExpectedValue) return b.netExpectedValue - a.netExpectedValue;
    const ai = SELLING_RANK.indexOf(a.key);
    const bi = SELLING_RANK.indexOf(b.key);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}
