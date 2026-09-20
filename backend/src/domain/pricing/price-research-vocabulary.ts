/**
 * Vokabular für `item_price_research.source` (docs/README.md §9e). Bewusst
 * NICHT in `domain/state-vocabulary.ts`, weil das dort geführte Vokabular
 * ausschließlich für StateGuardService-relevante Lifecycle-Enums ist — diese
 * Quelle hat keinen State-Machine-Bezug. Bewusst NICHT im Entity-File
 * definiert, damit `export *` im Entities-Barrel (siehe `data-source.ts`,
 * `entities: Object.values(entities)`) keine Nicht-Entity-Konstanten
 * mit einsammelt.
 */
export const PRICE_RESEARCH_SOURCES = ['EBAY_ACTIVE_LISTINGS', 'ANKAUF_PORTAL'] as const;
export type PriceResearchSource = (typeof PRICE_RESEARCH_SOURCES)[number];
