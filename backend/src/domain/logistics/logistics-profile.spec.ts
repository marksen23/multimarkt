import {
  exceedsParcelLimit,
  shippingCostEur,
  shippingPortalsAllowed,
  type LogisticsProfile,
} from './logistics-profile';

const smallParcel: LogisticsProfile = {
  captured: true,
  weightGrams: 180,
  lengthCm: 22,
  widthCm: 16,
  heightCm: 2,
  bulky: false,
  pickupOnly: false,
  shippingPossible: true,
  postalCode: '10115',
};

const sofa: LogisticsProfile = {
  captured: true,
  weightGrams: 45_000,
  lengthCm: 210,
  widthCm: 95,
  heightCm: 85,
  bulky: true,
  pickupOnly: true,
  shippingPossible: false,
  postalCode: '10115',
};

describe('logistics profile', () => {
  it('allows shipping portals for a small parcel and prices it from weight and size', () => {
    expect(shippingPortalsAllowed(smallParcel)).toBe(true);
    expect(shippingCostEur(smallParcel)).toBe(1.95);
    expect(shippingCostEur(smallParcel)).not.toBe(1.5);
  });

  it('refuses shipping portals for a sofa', () => {
    expect(exceedsParcelLimit(sofa)).toBe(true);
    expect(shippingPortalsAllowed(sofa)).toBe(false);
    expect(shippingCostEur(sofa)).toBe(0);
  });

  it('refuses shipping portals when the measurements are a sofa even if shipping was ticked', () => {
    const oversized: LogisticsProfile = {
      ...sofa,
      bulky: false,
      pickupOnly: false,
      shippingPossible: true,
    };
    expect(shippingPortalsAllowed(oversized)).toBe(false);
  });

  it('treats bulky or pickup-only as no shipping, even for a letter', () => {
    expect(shippingPortalsAllowed({ ...smallParcel, bulky: true, pickupOnly: false })).toBe(false);
    expect(shippingPortalsAllowed({ ...smallParcel, pickupOnly: true })).toBe(false);
  });

  it('does not recommend shipping before the profile is saved', () => {
    expect(shippingPortalsAllowed({ ...smallParcel, captured: false })).toBe(false);
    expect(shippingCostEur({ ...smallParcel, captured: false })).toBe(0);
  });
});
