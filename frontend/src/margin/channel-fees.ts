// Spiegelt backend/src/domain/pricing/channel-fees.ts. Dieselbe Rundung,
// damit die Zeile neben dem Preisvorschlag dem Netto der Disposition entspricht,
// sobald dort dieselbe Versandannahme gilt.

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

export const DEFAULT_CHANNEL_FEE_ASSUMPTIONS: ChannelFeeAssumptions = {
  KLEINANZEIGEN: { percent: 0, fixedEur: 0 },
  EBAY: { percent: 11, fixedEur: 0 },
  VINTED: { percent: 5, fixedEur: 0.7 },
};

export const CHANNEL_FEE_LABELS: Record<SellingChannelKey, string> = {
  KLEINANZEIGEN: 'Kleinanzeigen',
  EBAY: 'eBay-Provision',
  VINTED: 'Vinted-Käuferschutz',
};

export const CHANNEL_NET_LABELS: Record<SellingChannelKey, string> = {
  KLEINANZEIGEN: 'Kleinanzeigen',
  EBAY: 'eBay',
  VINTED: 'Vinted',
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
  line: string;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

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

/** Spiegelt comparisonShippingEur im Backend. */
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

export function netRemainingLine(netEur: number): string {
  return `bei Verkauf zu diesem Preis bleiben ${netEur.toFixed(2)} €`;
}

export function compareChannelsByNet(input: {
  salePriceEur: number;
  channels: ChannelFeeAssumptions;
  shippingEur: number;
}): ChannelNetLine[] {
  const lines = SELLING_CHANNEL_KEYS.map((key) => {
    const fee = input.channels[key];
    const netEur = channelNetRemainingEur(input.salePriceEur, fee, input.shippingEur);
    return {
      key,
      percent: fee.percent,
      fixedEur: fee.fixedEur,
      feeEur: roundMoney(
        roundMoney(roundMoney(input.salePriceEur) * (fee.percent / 100)) + roundMoney(fee.fixedEur),
      ),
      shippingEur: roundMoney(input.shippingEur),
      netEur,
      line: netRemainingLine(netEur),
    };
  });
  return lines.sort((a, b) => {
    if (a.netEur !== b.netEur) return b.netEur - a.netEur;
    return CHANNEL_RANK[a.key] - CHANNEL_RANK[b.key];
  });
}
