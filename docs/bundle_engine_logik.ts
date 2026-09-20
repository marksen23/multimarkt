/**
 * ==============================================================================
 * Bundle Engine (Phase 4): Intelligente Konvolut-Bildung
 * ==============================================================================
 * Diese Logik analysiert das unverkaufte Inventar eines Nutzers und sucht nach
 * Synergien, um den Aufwand zu minimieren und die Verkaufschancen zu maximieren.
 */

export interface InventoryItem {
  id: string;
  title: string;
  category: string;
  attributes: Record<string, any>;
  marketMedianPrice: number;
  status: 'READY' | 'PUBLISHED' | 'SOLD';
}

export interface BundleSuggestion {
  suggestedTitle: string;
  itemIds: string[];
  combinedMarketValue: number;
  suggestedBundlePrice: number;
  reasoning: string;
}

export class BundleEngine {
  
  /**
   * Analysiert das Inventar und gibt Bundle-Vorschläge zurück.
   */
  public analyzeInventoryForBundles(inventory: InventoryItem[]): BundleSuggestion[] {
    const suggestions: BundleSuggestion[] = [];
    
    // Nur Artikel betrachten, die noch nicht gelistet oder verkauft sind
    const availableItems = inventory.filter(item => item.status === 'READY');

    // 1. Gruppierung nach Kategorien
    const itemsByCategory = this.groupBy(availableItems, 'category');

    // 2. Bundle-Strategie: Kleidung (Gleiche Größe)
    if (itemsByCategory['Bekleidung > Kinder']) {
      const kidsClothes = itemsByCategory['Bekleidung > Kinder'];
      
      // Untergruppierung nach Größe
      const clothesBySize = this.groupByAttributes(kidsClothes, 'size');
      
      for (const [size, items] of Object.entries(clothesBySize)) {
        if (items.length >= 3) {
          const combinedValue = items.reduce((sum, item) => sum + item.marketMedianPrice, 0);
          
          // Bundle-Rabatt anwenden (z.B. 20% günstiger als Einzelkauf)
          const bundlePrice = Math.floor(combinedValue * 0.8);
          
          suggestions.push({
            suggestedTitle: `Kleidungspaket Kinder - Größe ${size} (${items.length} Teile)`,
            itemIds: items.map(i => i.id),
            combinedMarketValue: combinedValue,
            suggestedBundlePrice: bundlePrice,
            reasoning: `Du hast ${items.length} Einzelteile in Größe ${size}. Einzeln bringen sie jeweils unter 5€ (lohnt den Versand nicht). Als Paket für ${bundlePrice}€ verkaufst du sie 3x schneller.`
          });
        }
      }
    }

    // 3. Bundle-Strategie: Medien (Bücher, Spiele) der gleichen Reihe/Genre
    if (itemsByCategory['Bücher'] || itemsByCategory['Videospiele']) {
      const mediaItems = [...(itemsByCategory['Bücher'] || []), ...(itemsByCategory['Videospiele'] || [])];
      
      // Filtern nach Artikeln mit sehr geringem Einzelwert (< 4€)
      const lowValueMedia = mediaItems.filter(item => item.marketMedianPrice < 4.00);
      
      if (lowValueMedia.length >= 5) {
        const combinedValue = lowValueMedia.reduce((sum, item) => sum + item.marketMedianPrice, 0);
        
        suggestions.push({
          suggestedTitle: `Überraschungspaket / Konvolut Medien (${lowValueMedia.length} Teile)`,
          itemIds: lowValueMedia.map(i => i.id),
          combinedMarketValue: combinedValue,
          suggestedBundlePrice: Math.floor(combinedValue * 0.7), // Starker Rabatt für schnellen Abverkauf
          reasoning: `Diese ${lowValueMedia.length} Artikel sind einzeln schwer verkäuflich (Wert je unter 4€). Ein Konvolut spart dir 5 separate Gänge zur Post.`
        });
      }
    }

    return suggestions;
  }

  // Hilfsfunktionen für die Gruppierung
  private groupBy(array: any[], key: string) {
    return array.reduce((result, currentValue) => {
      (result[currentValue[key]] = result[currentValue[key]] || []).push(currentValue);
      return result;
    }, {});
  }

  private groupByAttributes(array: any[], attributeKey: string) {
    return array.reduce((result, currentValue) => {
      const attrValue = currentValue.attributes[attributeKey]?.value || 'Unbekannt';
      (result[attrValue] = result[attrValue] || []).push(currentValue);
      return result;
    }, {});
  }
}