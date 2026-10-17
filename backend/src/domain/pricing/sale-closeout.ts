/**
 * Verkaufsabschluss (Feature-Plan 3.4). Reine Rechnung, keine DB.
 *
 * Erlös minus Gebühren minus Versand ist der Netto. Zieht man den Einstand
 * ab, bleibt der Nettogewinn. Ohne Einstand gibt es keinen Gewinn — die
 * Kostenbestandteile bleiben trotzdem gespeichert.
 *
 * Dieselbe Cent-Reihenfolge wie die erwartete Marge: Beträge zuerst runden,
 * dann Netto, dann Gewinn. Die Gebühr ist hier ein erfasster Betrag, nicht
 * der Prozentsatz aus den Annahmen.
 */

import { roundMoney } from './expected-margin';

export interface SaleCloseoutInput {
  proceedsEur: number;
  feeEur: number;
  shippingEur: number;
  purchasePriceEur: number | null;
}

export interface SaleCloseout {
  proceedsEur: number;
  feeEur: number;
  shippingEur: number;
  netEur: number;
  purchasePriceEur: number | null;
  netProfitEur: number | null;
  marginPercent: number | null;
}

export function computeSaleCloseout(input: SaleCloseoutInput): SaleCloseout {
  const proceedsEur = roundMoney(input.proceedsEur);
  const feeEur = roundMoney(input.feeEur);
  const shippingEur = roundMoney(input.shippingEur);
  const netEur = roundMoney(proceedsEur - feeEur - shippingEur);
  const purchasePriceEur =
    input.purchasePriceEur == null ? null : roundMoney(input.purchasePriceEur);
  const netProfitEur =
    purchasePriceEur == null ? null : roundMoney(netEur - purchasePriceEur);
  const marginPercent =
    netProfitEur == null || purchasePriceEur == null || purchasePriceEur <= 0
      ? null
      : roundMoney((netProfitEur / purchasePriceEur) * 100);

  return {
    proceedsEur,
    feeEur,
    shippingEur,
    netEur,
    purchasePriceEur,
    netProfitEur,
    marginPercent,
  };
}
