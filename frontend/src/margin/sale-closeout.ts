// Spiegelt backend/src/domain/pricing/sale-closeout.ts. Dieselbe
// Cent-Reihenfolge, damit die Vorschau im Formular der gespeicherten
// Zahl entspricht.

export interface SaleCloseoutDraft {
  proceedsEur: number;
  portal: string;
  feeEur: number;
  shippingEur: number;
  paymentMethod: string | null;
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

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeSaleCloseout(input: {
  proceedsEur: number;
  feeEur: number;
  shippingEur: number;
  purchasePriceEur: number | null;
}): SaleCloseout {
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

export function formatEur(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toFixed(2)} €`;
}

export const SALE_PORTALS = ['Kleinanzeigen', 'Vinted', 'eBay', 'Facebook'] as const;

export const PAYMENT_METHODS = ['Bar', 'PayPal', 'Überweisung'] as const;

const PORTAL_BY_MARKETPLACE: Record<string, string> = {
  KLEINANZEIGEN: 'Kleinanzeigen',
  VINTED: 'Vinted',
  EBAY: 'eBay',
  FACEBOOK: 'Facebook',
};

export function portalLabel(marketplaceId: string): string {
  return PORTAL_BY_MARKETPLACE[marketplaceId] ?? marketplaceId;
}
