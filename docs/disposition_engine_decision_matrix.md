/**
 * ==============================================================================
 * Disposition Engine (Phase 2): "Lohnt sich das?" & Plattformstrategie
 * ==============================================================================
 * Diese Logik entscheidet nach dem Confidence Center, welcher Weg für den
 * Artikel ökonomisch und logistisch am sinnvollsten ist.
 */

export interface ProductProfile {
  id: string;
  category: string;
  condition: 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR' | 'DEFECTIVE';
  estimatedNewPrice: number;
  marketMedianPrice: number;
  weightKg: number;
  isBulky: boolean; // Sperrgut / Nur Abholung
  userGoal: 'MAX_PROFIT' | 'BALANCED' | 'FAST_SALE' | 'MINIMAL_EFFORT';
}

export interface DispositionRecommendation {
  action: 'SELL_ONLINE' | 'LOCAL_PICKUP_ONLY' | 'DONATE' | 'DISCARD' | 'BUYBACK_SERVICE';
  recommendedPlatforms: {
    key: string;
    netExpectedValue: number;
    reasoning: string;
  }[];
  rationale: string;
  estimatedEffortMinutes: number;
}

export class DispositionEngine {
  
  /**
   * Berechnet den Expected Net Value (ENV) und entscheidet über den Dispositionsweg.
   */
  evaluateProduct(product: ProductProfile): DispositionRecommendation {
    // 1. Schätzung des Netto-Erlöses nach Gebühren und Aufwand
    const marketPrice = product.marketMedianPrice;

    // Schwellenwert-Prüfung: Lohnt sich der Aufwand?
    // Wenn der Marktwert unter 10 € liegt und der Aufwand (Fotos, Text, Chat, Versand) zu hoch ist:
    if (marketPrice < 10 && product.condition !== 'NEW') {
      return {
        action: 'DONATE',
        recommendedPlatforms: [],
        rationale: `Der geschätzte Marktwert liegt bei ca. ${marketPrice.toFixed(2)} €. Im Verhältnis zum Aufwand (Verpackung, Postweg, Risiko von Rückfragen) lohnt sich ein Online-Verkauf ökonomisch kaum. Wir empfehlen eine Spende oder den Weg zum Wertstoffhof.`,
        estimatedEffortMinutes: 5
      };
    }

    // 2. Prüfung auf Ankaufsdienste (z.B. für Elektronik / Medien / Markenkleidung)
    if (['electronics', 'books', 'media'].includes(product.category)) {
      const estimatedBuybackPrice = marketPrice * 0.4; // Beispielhafter Abschlag für Ankäufer
      if (product.userGoal === 'FAST_SALE' || product.userGoal === 'MINIMAL_EFFORT') {
        return {
          action: 'BUYBACK_SERVICE',
          recommendedPlatforms: [
            { key: 'rebuy_zoxs', netExpectedValue: estimatedBuybackPrice, reasoning: 'Sofortankauf ohne Käuferkommunikation und Versandrisiko.' }
          ],
          rationale: 'Da du einen schnellen Verkauf ohne Aufwand wünschst, ist ein Direktankaufsdienst die effizienteste Wahl.',
          estimatedEffortMinutes: 10
        };
      }
    }

    // 3. Klassische Online-Plattformen evaluieren (ENV-Berechnung)
    const platforms = [];

    // eBay (Hohe Reichweite, Versand, Gebührenfrei für Privatverkäufer in DE seit 2024/2026)
    if (!product.isBulky) {
      const ebayEnv = marketPrice * 0.95 - 2.50; // Abzug für Verpackungsmaterial/Aufwand
      platforms.push({
        key: 'EBAY',
        netExpectedValue: ebayEnv,
        reasoning: 'Maximale bundesweite Reichweite für den Versandverkauf.'
      });
    }

    // Kleinanzeigen (Lokal, keine Gebühren, Abholung oder Versand)
    const kleinanzeigenEnv = marketPrice * 1.0 - (product.isBulky ? 0 : 1.50);
    platforms.push({
      key: 'KLEINANZEIGEN',
      netExpectedValue: kleinanzeigenEnv,
      reasoning: 'Ideal für lokale Abholung (kein Versandaufwand) oder schnelle Käufer.'
    });

    // Vinted (Falls Mode/Kleidung)
    if (product.category === 'fashion' || product.category === 'shoes') {
      platforms.push({
        key: 'VINTED',
        netExpectedValue: marketPrice, // Käufer zahlt Käuferschutz
        reasoning: 'Perfekte Zielgruppe für Mode, Verkäufer zahlt keine Provision.'
      });
    }

    // Sortieren nach bestem Erlös / Ziel
    platforms.sort((a, b) => b.netExpectedValue - a.netExpectedValue);

    return {
      action: product.isBulky ? 'LOCAL_PICKUP_ONLY' : 'SELL_ONLINE',
      recommendedPlatforms: platforms,
      rationale: `Basierend auf deinem Ziel (${product.userGoal}) und dem Zustand (${product.condition}) erzielt dieser Artikel den besten Nettoerlös über folgende Kanäle.`,
      estimatedEffortMinutes: product.isBulky ? 15 : 25
    };
  }
}
```