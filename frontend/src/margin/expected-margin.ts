// Spiegelt backend/src/domain/pricing/expected-margin.ts. Dieselbe
// Reihenfolge (Gebühr auf Cent, dann Netto, dann Marge), damit die
// Preisrecherche live dieselbe Zahl zeigt wie die Disposition nach
// „Berechnen“.

export const NOT_INDIVIDUAL_SALE_NOTICE = 'nicht einzeln verkaufen';

export interface MarginAssumptions {
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

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeExpectedMargin(input: {
  salePriceEur: number;
  purchasePriceEur: number | null;
  feePercent: number;
  shippingEur: number;
  singleSaleThresholdEur: number | null;
}): ExpectedMargin {
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
