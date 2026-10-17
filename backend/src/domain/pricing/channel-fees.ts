import { roundMoney } from './expected-margin';

/**
 * Gebührenannahmen je Verkaufskanal (Feature-Plan 3.10).
 * Keine Live-Tarife: Prozente und Fixkosten pflegt der Nutzer, weil sich
 * Provision und Käuferschutz ändern. Kleinanzeigen startet bei 0 €.
 */

export const SELLING_CHANNEL_KEYS = ['KLEINANZEIGEN', 'EBAY', 'VINTED'] as const;
export type SellingChannelKey = (typeof SELLING_CHANNEL_KEYS)[number];

export interface ChannelFeeRate {
  percent: number;
  fixedEur: number;
}

export interface ChannelFeeAssumptions {
  KLEINANZEIGEN: ChannelFeeRate;
  EBAY: ChannelFeeRate;
  VINTED: ChannelFeeRate;
}

/** Startwerte, überschreibbar. eBay-Provision und Vinted-Käuferschutz sind Annahmen. */
export const DEFAULT_CHANNEL_FEE_ASSUMPTIONS: ChannelFeeAssumptions = {
  KLEINANZEIGEN: { percent: 0, fixedEur: 0 },
  EBAY: { percent: 11, fixedEur: 0 },
  VINTED: { percent: 5, fixedEur: 0.7 },
};

const CHANNEL_RANK: Record<SellingChannelKey, number> = {
  KLEINANZEIGEN: 0,
  EBAY: 1,
  VINTED: 2,
};

export interface ChannelNetLine {
  key: SellingChannelKey;
  percent: number;
  fixedEur: number;
  feeEur: number;
  shippingEur: number;
  netEur: number;
}

/**
 * Verkaufspreis minus Prozentgebühr (auf Cent), minus Fixkosten, minus Versand.
 * Dieselbe Reihenfolge wie die erwartete Marge, plus die Fixkosten danach.
 */
export function channelNetRemainingEur(
  salePriceEur: number,
  fee: ChannelFeeRate,
  shippingEur: number,
): number {
  const price = roundMoney(salePriceEur);
  const percentFee = roundMoney(price * (fee.percent / 100));
  const fixed = roundMoney(fee.fixedEur);
  const shipping = roundMoney(shippingEur);
  const feeEur = roundMoney(percentFee + fixed);
  return roundMoney(price - feeEur - shipping);
}

export function channelFeeEur(salePriceEur: number, fee: ChannelFeeRate): number {
  const price = roundMoney(salePriceEur);
  const percentFee = roundMoney(price * (fee.percent / 100));
  return roundMoney(percentFee + roundMoney(fee.fixedEur));
}

/** Höchster Netto zuerst. Gleiche Netto behalten Kleinanzeigen, eBay, Vinted. */
export function compareChannelsByNet(input: {
  salePriceEur: number;
  channels: ChannelFeeAssumptions;
  shippingEur: number;
  include?: readonly SellingChannelKey[];
}): ChannelNetLine[] {
  const keys = input.include ?? SELLING_CHANNEL_KEYS;
  const lines = keys.map((key) => {
    const fee = input.channels[key];
    const feeEur = channelFeeEur(input.salePriceEur, fee);
    return {
      key,
      percent: fee.percent,
      fixedEur: fee.fixedEur,
      feeEur,
      shippingEur: roundMoney(input.shippingEur),
      netEur: channelNetRemainingEur(input.salePriceEur, fee, input.shippingEur),
    };
  });
  return lines.sort((a, b) => {
    if (a.netEur !== b.netEur) return b.netEur - a.netEur;
    return CHANNEL_RANK[a.key] - CHANNEL_RANK[b.key];
  });
}

export function netRemainingLine(netEur: number): string {
  return `bei Verkauf zu diesem Preis bleiben ${netEur.toFixed(2)} €`;
}

/**
 * Versand in der Kanalzeile. Abholung zieht nichts ab. Liegt eine
 * Versandpauschale über 0 €, gilt diese Annahme. Sonst die Paketkosten
 * aus dem Logistikprofil.
 */
export function comparisonShippingEur(input: {
  shippingAllowed: boolean;
  parcelEur: number;
  flatEur: number;
}): number {
  if (!input.shippingAllowed) return 0;
  const flat = roundMoney(input.flatEur);
  if (flat > 0) return flat;
  return roundMoney(input.parcelEur);
}

export function channelFeesFromUser(
  user: {
    kleinanzeigenFeePercent?: number | null;
    kleinanzeigenFeeFixedEur?: number | null;
    ebayFeePercent?: number | null;
    ebayFeeFixedEur?: number | null;
    vintedFeePercent?: number | null;
    vintedFeeFixedEur?: number | null;
  } | null
  | undefined,
): ChannelFeeAssumptions {
  if (!user) return DEFAULT_CHANNEL_FEE_ASSUMPTIONS;
  return {
    KLEINANZEIGEN: {
      percent: user.kleinanzeigenFeePercent ?? DEFAULT_CHANNEL_FEE_ASSUMPTIONS.KLEINANZEIGEN.percent,
      fixedEur: user.kleinanzeigenFeeFixedEur ?? DEFAULT_CHANNEL_FEE_ASSUMPTIONS.KLEINANZEIGEN.fixedEur,
    },
    EBAY: {
      percent: user.ebayFeePercent ?? DEFAULT_CHANNEL_FEE_ASSUMPTIONS.EBAY.percent,
      fixedEur: user.ebayFeeFixedEur ?? DEFAULT_CHANNEL_FEE_ASSUMPTIONS.EBAY.fixedEur,
    },
    VINTED: {
      percent: user.vintedFeePercent ?? DEFAULT_CHANNEL_FEE_ASSUMPTIONS.VINTED.percent,
      fixedEur: user.vintedFeeFixedEur ?? DEFAULT_CHANNEL_FEE_ASSUMPTIONS.VINTED.fixedEur,
    },
  };
}
