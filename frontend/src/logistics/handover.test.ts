import { describe, expect, it } from 'vitest';
import { handoverFlags, handoverFrom } from './handover';

describe('handoverFrom', () => {
  it('reads the saved choice and ignores a half-set combination', () => {
    expect(handoverFrom({ bulky: false, pickupOnly: false, shippingPossible: true })).toBe('shipping');
    expect(handoverFrom({ bulky: false, pickupOnly: true, shippingPossible: false })).toBe('pickup');
    expect(handoverFrom({ bulky: true, pickupOnly: true, shippingPossible: false })).toBe('bulky');
    expect(handoverFrom({ bulky: false, pickupOnly: false, shippingPossible: false })).toBeNull();
  });
});

describe('handoverFlags', () => {
  it('keeps shipping and pickup from being selected together', () => {
    expect(handoverFlags('shipping')).toEqual({ bulky: false, pickupOnly: false, shippingPossible: true });
    expect(handoverFlags('pickup')).toEqual({ bulky: false, pickupOnly: true, shippingPossible: false });
    expect(handoverFlags('bulky')).toEqual({ bulky: true, pickupOnly: true, shippingPossible: false });
  });
});
