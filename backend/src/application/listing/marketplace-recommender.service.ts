import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SalesGoal } from '../../domain/ai/description-generation-provider.interface';
import { ItemAttributeEntity, ItemEntity } from '../../infrastructure/database/entities';

export type SecondhandMarketplace =
  | 'KLEINANZEIGEN'
  | 'EBAY'
  | 'VINTED'
  | 'MARKT_DE'
  | 'QUOKA'
  | 'FACEBOOK'
  | 'MOMOX'
  | 'REBUY';

export type MarketplaceType = 'CLASSIFIED' | 'AUCTION_PLATFORM' | 'FASHION_COMMUNITY' | 'BUYBACK';
export type EstimatedTimeToSale = 'INSTANT' | 'FAST' | 'MEDIUM' | 'SLOW';

export interface MarketplaceRecommendation {
  marketplace: SecondhandMarketplace;
  label: string;
  type: MarketplaceType;
  score: number;
  rank: number;
  reasons: string[];
  cautions: string[];
  estimatedTimeToSale: EstimatedTimeToSale;
  feePercent: number;
  listingUrl: string;
}

export interface MarketplaceRecommendationResult {
  itemId: string;
  salesGoal: SalesGoal;
  detectedCategory: string;
  recommendations: MarketplaceRecommendation[];
}

// ─── Static metadata ────────────────────────────────────────────────────────

type CategoryGroup = 'ELECTRONICS' | 'FASHION' | 'HOME_DECOR' | 'MEDIA' | 'TOYS_KIDS' | 'SPORTS' | 'OTHER';

const MARKETPLACE_META: Record<
  SecondhandMarketplace,
  { label: string; type: MarketplaceType; feePercent: number; estimatedTimeToSale: EstimatedTimeToSale; listingUrl: string }
> = {
  KLEINANZEIGEN: { label: 'Kleinanzeigen',      type: 'CLASSIFIED',        feePercent: 0,  estimatedTimeToSale: 'MEDIUM',   listingUrl: 'https://www.kleinanzeigen.de/anzeige-aufgeben' },
  EBAY:          { label: 'eBay',               type: 'AUCTION_PLATFORM',  feePercent: 13, estimatedTimeToSale: 'FAST',     listingUrl: 'https://www.ebay.de/sl/sell' },
  VINTED:        { label: 'Vinted',             type: 'FASHION_COMMUNITY', feePercent: 0,  estimatedTimeToSale: 'FAST',     listingUrl: 'https://www.vinted.de/sell' },
  MARKT_DE:      { label: 'Markt.de',           type: 'CLASSIFIED',        feePercent: 0,  estimatedTimeToSale: 'SLOW',     listingUrl: 'https://www.markt.de/aufgeben/' },
  QUOKA:         { label: 'Quoka',              type: 'CLASSIFIED',        feePercent: 0,  estimatedTimeToSale: 'SLOW',     listingUrl: 'https://www.quoka.de/anzeige-aufgeben' },
  FACEBOOK:      { label: 'Facebook Marketplace', type: 'CLASSIFIED',     feePercent: 0,  estimatedTimeToSale: 'MEDIUM',   listingUrl: 'https://www.facebook.com/marketplace/create/item' },
  MOMOX:         { label: 'momox',              type: 'BUYBACK',           feePercent: 0,  estimatedTimeToSale: 'INSTANT',  listingUrl: 'https://www.momox.de' },
  REBUY:         { label: 'reBuy',              type: 'BUYBACK',           feePercent: 0,  estimatedTimeToSale: 'INSTANT',  listingUrl: 'https://www.rebuy.de/kaufen' },
};

// Category-affinity base scores (0–100)
const CATEGORY_SCORES: Record<SecondhandMarketplace, Record<CategoryGroup, number>> = {
  KLEINANZEIGEN: { ELECTRONICS: 70, FASHION: 58, HOME_DECOR: 78, MEDIA: 62, TOYS_KIDS: 68, SPORTS: 68, OTHER: 68 },
  EBAY:          { ELECTRONICS: 88, FASHION: 48, HOME_DECOR: 52, MEDIA: 70, TOYS_KIDS: 72, SPORTS: 65, OTHER: 62 },
  VINTED:        { ELECTRONICS:  8, FASHION: 92, HOME_DECOR: 12, MEDIA: 15, TOYS_KIDS: 35, SPORTS: 42, OTHER: 18 },
  MARKT_DE:      { ELECTRONICS: 40, FASHION: 28, HOME_DECOR: 72, MEDIA: 50, TOYS_KIDS: 55, SPORTS: 52, OTHER: 52 },
  QUOKA:         { ELECTRONICS: 35, FASHION: 22, HOME_DECOR: 68, MEDIA: 42, TOYS_KIDS: 48, SPORTS: 45, OTHER: 48 },
  FACEBOOK:      { ELECTRONICS: 60, FASHION: 48, HOME_DECOR: 74, MEDIA: 45, TOYS_KIDS: 62, SPORTS: 60, OTHER: 60 },
  MOMOX:         { ELECTRONICS: 12, FASHION: 35, HOME_DECOR:  0, MEDIA: 90, TOYS_KIDS: 25, SPORTS:  0, OTHER:  5 },
  REBUY:         { ELECTRONICS: 72, FASHION:  0, HOME_DECOR:  0, MEDIA: 80, TOYS_KIDS: 68, SPORTS:  0, OTHER:  5 },
};

// Sales goal deltas (additive adjustment)
const GOAL_DELTAS: Record<SecondhandMarketplace, Record<SalesGoal, number>> = {
  KLEINANZEIGEN: { MAX_PROFIT:  +5, FAST_SALE: +10, BALANCED:  0, MINIMAL_EFFORT:  +5 },
  EBAY:          { MAX_PROFIT: +15, FAST_SALE:  -5, BALANCED:  0, MINIMAL_EFFORT: -15 },
  VINTED:        { MAX_PROFIT:  -5, FAST_SALE: +15, BALANCED:  0, MINIMAL_EFFORT:  +5 },
  MARKT_DE:      { MAX_PROFIT:   0, FAST_SALE: -10, BALANCED:  0, MINIMAL_EFFORT:   0 },
  QUOKA:         { MAX_PROFIT:  -5, FAST_SALE: -10, BALANCED:  0, MINIMAL_EFFORT:   0 },
  FACEBOOK:      { MAX_PROFIT:   0, FAST_SALE:  +8, BALANCED:  0, MINIMAL_EFFORT:  +5 },
  MOMOX:         { MAX_PROFIT: -20, FAST_SALE: +20, BALANCED:  0, MINIMAL_EFFORT: +30 },
  REBUY:         { MAX_PROFIT: -20, FAST_SALE: +20, BALANCED:  0, MINIMAL_EFFORT: +30 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectCategoryGroup(categoryValue: string | null): CategoryGroup {
  if (!categoryValue) return 'OTHER';
  const n = categoryValue.toLowerCase();
  if (/elektr|techni|computer|smartphone|tablet|kamera|audio|gaming|konsole|laptop|handy|iphone|ipad|macbook/.test(n))
    return 'ELECTRONICS';
  if (/kleidung|mode|schuhe|accessoir|textil|jacke|hose|hemd|kleid|shirt|pullover|mantel|tasche|handtasch/.test(n))
    return 'FASHION';
  if (/möbel|haushalt|wohnen|küche|lampe|deko|sofa|tisch|stuhl|regal|bett|wohnzimmer|schlafzimmer|schrank/.test(n))
    return 'HOME_DECOR';
  if (/buch|bücher|medien|\bcd\b|\bdvd\b|film|musik|\bspiele?\b|vinyl|album/.test(n))
    return 'MEDIA';
  if (/spielzeug|kinderbedarf|lego|\bkind\b|baby|puppe|kinder/.test(n))
    return 'TOYS_KIDS';
  if (/sport|outdoor|fahrrad|fitness|ski|tennis|fußball|laufen|yoga/.test(n))
    return 'SPORTS';
  return 'OTHER';
}

function conditionDelta(marketplace: SecondhandMarketplace, condition: string | null): number {
  const c = (condition ?? '').toLowerCase();
  const isDefective = /defekt|kaputt|beschädigt/.test(c);
  const isNew = /\bneu\b|^new$/.test(c);

  if (isDefective) {
    if (marketplace === 'KLEINANZEIGEN') return +10;
    if (marketplace === 'EBAY') return -10;
    if (marketplace === 'MOMOX' || marketplace === 'REBUY') return -30;
    if (marketplace === 'VINTED') return -15;
  }
  if (isNew) {
    if (marketplace === 'EBAY' || marketplace === 'VINTED') return +5;
  }
  return 0;
}

function buildReasons(
  marketplace: SecondhandMarketplace,
  category: CategoryGroup,
  goal: SalesGoal,
  condition: string | null,
): { reasons: string[]; cautions: string[] } {
  const reasons: string[] = [];
  const cautions: string[] = [];

  // Primary category reason
  const catReasons: Partial<Record<SecondhandMarketplace, Partial<Record<CategoryGroup, string>>>> = {
    EBAY:    { ELECTRONICS: 'Elektronik erzielt hier durch große Käuferschaft die besten Preise', TOYS_KIDS: 'Spielzeug und Sammlerstücke finden auf eBay viele Käufer', MEDIA: 'Bücher und Medien sind auf eBay gut auffindbar' },
    VINTED:  { FASHION: 'Kleidung verkauft sich hier am schnellsten — aktive Fashion-Community', SPORTS: 'Sportmode und -zubehör hat auf Vinted gute Nachfrage' },
    KLEINANZEIGEN: { HOME_DECOR: 'Möbel und Haushalt laufen hier am besten — lokale Abholung ideal', ELECTRONICS: 'Hohe Reichweite, kostenlos', OTHER: 'Gute Reichweite für alle Kategorien, kostenlos' },
    MARKT_DE: { HOME_DECOR: 'Gut für Möbel und Sperrgut mit lokaler Abholung' },
    QUOKA:   { HOME_DECOR: 'Regionale Käufer für große Gegenstände und Sperrgut' },
    FACEBOOK: { HOME_DECOR: 'Lokale Community — Möbel sind hier besonders gefragt', ELECTRONICS: 'Schnelle lokale Verkäufe möglich' },
    REBUY:   { ELECTRONICS: 'Sofortiger Ankauf ohne Wartezeit', MEDIA: 'Bücher und Spiele: schneller Ankauf per Versand', TOYS_KIDS: 'Spielzeug und Konsolen direkt ankaufbar' },
    MOMOX:   { MEDIA: 'Bücher und Medien: schneller Ankauf direkt per Versand', FASHION: 'Markenkleidung kann per Post eingeschickt werden' },
  };
  const catReason = catReasons[marketplace]?.[category];
  if (catReason) reasons.push(catReason);

  // Goal-based reason (only if meaningful delta)
  const goalDelta = GOAL_DELTAS[marketplace][goal];
  if (goalDelta >= 10) {
    const goalReasons: Partial<Record<SecondhandMarketplace, Partial<Record<SalesGoal, string>>>> = {
      EBAY:     { MAX_PROFIT: 'Auktionen erzielen oft überdurchschnittliche Preise' },
      VINTED:   { FAST_SALE: 'Mode-Community führt zu schnellen Verkäufen' },
      MOMOX:    { FAST_SALE: 'Sofortankauf in Minuten abgeschlossen', MINIMAL_EFFORT: 'Kein Inserieren nötig — einfach einsenden' },
      REBUY:    { FAST_SALE: 'Sofortankauf in Minuten abgeschlossen', MINIMAL_EFFORT: 'Kein Inserieren nötig — einfach einsenden' },
      FACEBOOK: { FAST_SALE: 'Lokale Käufer reagieren oft schnell' },
      KLEINANZEIGEN: { FAST_SALE: 'Sehr hohe Reichweite beschleunigt den Verkauf' },
    };
    const goalReason = goalReasons[marketplace]?.[goal];
    if (goalReason) reasons.push(goalReason);
  }

  if (reasons.length === 0) {
    reasons.push('Alternative Plattform für breitere Reichweite');
  }

  // Cautions
  if (MARKETPLACE_META[marketplace].feePercent > 0) {
    cautions.push(`${MARKETPLACE_META[marketplace].feePercent}% Verkaufsgebühr`);
  }
  if (marketplace === 'VINTED' && category !== 'FASHION' && category !== 'SPORTS') {
    cautions.push('Primär Modeplattform — andere Kategorien weniger sichtbar');
  }
  const c = (condition ?? '').toLowerCase();
  if (marketplace === 'EBAY' && /defekt|kaputt|beschädigt/.test(c)) {
    cautions.push('Defekte Ware hat bei eBay höheres Streitpotenzial');
  }
  if ((marketplace === 'MOMOX' || marketplace === 'REBUY') && goal === 'MAX_PROFIT') {
    cautions.push('Ankaufspreise liegen deutlich unter dem Marktpreis');
  }

  return { reasons, cautions };
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class MarketplaceRecommenderService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async recommend(itemId: string, salesGoal: SalesGoal | null = null): Promise<MarketplaceRecommendationResult> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id: itemId });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    const attributes = await this.dataSource.manager.find(ItemAttributeEntity, { where: { itemId } });
    const categoryValue = attributes.find((a) => a.attributeKey === 'category')?.attributeValue ?? null;
    const categoryGroup = detectCategoryGroup(categoryValue);
    const goal = salesGoal ?? 'BALANCED';

    const all: MarketplaceRecommendation[] = (Object.keys(MARKETPLACE_META) as SecondhandMarketplace[]).map(
      (marketplace) => {
        const base = CATEGORY_SCORES[marketplace][categoryGroup];
        const score = Math.max(0, Math.min(100, base + GOAL_DELTAS[marketplace][goal] + conditionDelta(marketplace, item.condition)));
        const { reasons, cautions } = buildReasons(marketplace, categoryGroup, goal, item.condition);
        const meta = MARKETPLACE_META[marketplace];
        return { marketplace, label: meta.label, type: meta.type, score, rank: 0, reasons, cautions, estimatedTimeToSale: meta.estimatedTimeToSale, feePercent: meta.feePercent, listingUrl: meta.listingUrl };
      },
    );

    const recommendations = all
      .filter((r) => r.score >= 15)
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    return { itemId, salesGoal: goal, detectedCategory: categoryValue ?? 'Unbekannt', recommendations };
  }
}
