/**
 * Erwartete Marge (Feature-Plan 3.3). Reine Rechnung, keine DB.
 *
 * Verkaufspreis minus Gebühr (Prozent, vom Nutzer gepflegt) minus Versand
 * ergibt den erwarteten Netto. Zieht man den Einstand ab, bleibt die Marge.
 * Liegt die Marge in Euro unter der gesetzten Schwelle, soll der Artikel
 * nicht einzeln verkauft werden.
 *
 * Rundung: Gebühr zuerst auf Cent, dann Netto, dann Marge. Prozent bezieht
 * sich auf den Einstand (Aufschlag), nicht auf den Verkaufspreis.
 */

export const NOT_INDIVIDUAL_SALE_NOTICE = 'nicht einzeln verkaufen';

export interface ExpectedMarginInput {
  salePriceEur: number;
  purchasePriceEur: number | null;
  feePercent: number;
  shippingEur: number;
  singleSaleThresholdEur: number | null;
}

export interface ExpectedMargin {
  salePriceEur: number;
  feePercent: number;
  feeEur: number;
  shippingEur: number;
  expectedNetEur: number;
  purchasePriceEur: number | null;
  marginEur: number | null;
  marginPercent: number | null;
  singleSaleThresholdEur: number | null;
  belowSingleSaleThreshold: boolean;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeExpectedMargin(input: ExpectedMarginInput): ExpectedMargin {
  const salePriceEur = roundMoney(input.salePriceEur);
  const feePercent = input.feePercent;
  const shippingEur = roundMoney(input.shippingEur);
  const feeEur = roundMoney(salePriceEur * (feePercent / 100));
  const expectedNetEur = roundMoney(salePriceEur - feeEur - shippingEur);
  const purchasePriceEur =
    input.purchasePriceEur == null ? null : roundMoney(input.purchasePriceEur);
  const marginEur =
    purchasePriceEur == null ? null : roundMoney(expectedNetEur - purchasePriceEur);
  const marginPercent =
    marginEur == null || purchasePriceEur == null || purchasePriceEur <= 0
      ? null
      : roundMoney((marginEur / purchasePriceEur) * 100);
  const singleSaleThresholdEur = input.singleSaleThresholdEur;
  const belowSingleSaleThreshold =
    singleSaleThresholdEur != null && marginEur != null && marginEur < singleSaleThresholdEur;

  return {
    salePriceEur,
    feePercent,
    feeEur,
    shippingEur,
    expectedNetEur,
    purchasePriceEur,
    marginEur,
    marginPercent,
    singleSaleThresholdEur,
    belowSingleSaleThreshold,
  };
}

export function individualSaleNotice(margin: ExpectedMargin): string | null {
  return margin.belowSingleSaleThreshold ? NOT_INDIVIDUAL_SALE_NOTICE : null;
}
