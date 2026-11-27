export type Handover = 'pickup' | 'shipping' | 'bulky';

export function handoverFrom(flags: {
  bulky: boolean;
  pickupOnly: boolean;
  shippingPossible: boolean;
}): Handover | null {
  if (flags.shippingPossible && !flags.pickupOnly && !flags.bulky) return 'shipping';
  if (flags.bulky) return 'bulky';
  if (flags.pickupOnly) return 'pickup';
  return null;
}

export function handoverFlags(mode: Handover): {
  bulky: boolean;
  pickupOnly: boolean;
  shippingPossible: boolean;
} {
  if (mode === 'shipping') return { bulky: false, pickupOnly: false, shippingPossible: true };
  if (mode === 'bulky') return { bulky: true, pickupOnly: true, shippingPossible: false };
  return { bulky: false, pickupOnly: true, shippingPossible: false };
}
