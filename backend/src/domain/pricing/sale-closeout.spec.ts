import { computeSaleCloseout } from './sale-closeout';

describe('computeSaleCloseout', () => {
  it('stores net profit against the Einstand', () => {
    const result = computeSaleCloseout({
      proceedsEur: 40,
      feeEur: 4,
      shippingEur: 5,
      purchasePriceEur: 15,
    });

    expect(result.netEur).toBe(31);
    expect(result.netProfitEur).toBe(16);
    expect(result.marginPercent).toBe(106.67);
    expect(result.purchasePriceEur).toBe(15);
  });

  it('keeps the costs when the Einstand is missing', () => {
    const result = computeSaleCloseout({
      proceedsEur: 26,
      feeEur: 2.6,
      shippingEur: 4.9,
      purchasePriceEur: null,
    });

    expect(result.netEur).toBe(18.5);
    expect(result.netProfitEur).toBeNull();
    expect(result.marginPercent).toBeNull();
  });

  it('rounds fee and shipping to cents before the profit', () => {
    const result = computeSaleCloseout({
      proceedsEur: 10,
      feeEur: 0.335,
      shippingEur: 0.335,
      purchasePriceEur: 8,
    });

    expect(result.feeEur).toBe(0.34);
    expect(result.shippingEur).toBe(0.34);
    expect(result.netEur).toBe(9.32);
    expect(result.netProfitEur).toBe(1.32);
  });

  it('allows a loss and does not divide by a zero Einstand', () => {
    const loss = computeSaleCloseout({
      proceedsEur: 10,
      feeEur: 0,
      shippingEur: 0,
      purchasePriceEur: 25,
    });
    const free = computeSaleCloseout({
      proceedsEur: 10,
      feeEur: 1,
      shippingEur: 2,
      purchasePriceEur: 0,
    });

    expect(loss.netProfitEur).toBe(-15);
    expect(loss.marginPercent).toBe(-60);
    expect(free.netEur).toBe(7);
    expect(free.netProfitEur).toBe(7);
    expect(free.marginPercent).toBeNull();
  });
});
