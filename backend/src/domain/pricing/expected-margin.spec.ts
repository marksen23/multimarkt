import {
  computeExpectedMargin,
  individualSaleNotice,
  NOT_INDIVIDUAL_SALE_NOTICE,
} from './expected-margin';

describe('computeExpectedMargin', () => {
  it('subtracts a percentage fee and shipping from the sale price', () => {
    const result = computeExpectedMargin({
      salePriceEur: 30,
      purchasePriceEur: 15,
      feePercent: 10,
      shippingEur: 5,
      singleSaleThresholdEur: null,
    });

    expect(result.feeEur).toBe(3);
    expect(result.expectedNetEur).toBe(22);
    expect(result.marginEur).toBe(7);
    expect(result.marginPercent).toBe(46.67);
    expect(result.belowSingleSaleThreshold).toBe(false);
  });

  it('leaves margin empty until an Einstand is stored', () => {
    const result = computeExpectedMargin({
      salePriceEur: 30,
      purchasePriceEur: null,
      feePercent: 0,
      shippingEur: 4.5,
      singleSaleThresholdEur: 5,
    });

    expect(result.expectedNetEur).toBe(25.5);
    expect(result.marginEur).toBeNull();
    expect(result.marginPercent).toBeNull();
    expect(result.belowSingleSaleThreshold).toBe(false);
    expect(individualSaleNotice(result)).toBeNull();
  });

  it('says not to sell individually only when margin is strictly below the threshold', () => {
    const below = computeExpectedMargin({
      salePriceEur: 20,
      purchasePriceEur: 18,
      feePercent: 0,
      shippingEur: 0,
      singleSaleThresholdEur: 5,
    });
    const exact = computeExpectedMargin({
      salePriceEur: 20,
      purchasePriceEur: 15,
      feePercent: 0,
      shippingEur: 0,
      singleSaleThresholdEur: 5,
    });

    expect(below.marginEur).toBe(2);
    expect(below.belowSingleSaleThreshold).toBe(true);
    expect(individualSaleNotice(below)).toBe(NOT_INDIVIDUAL_SALE_NOTICE);
    expect(exact.marginEur).toBe(5);
    expect(exact.belowSingleSaleThreshold).toBe(false);
  });

  it('does not invent a warning when the user has not set a threshold', () => {
    const result = computeExpectedMargin({
      salePriceEur: 10,
      purchasePriceEur: 40,
      feePercent: 0,
      shippingEur: 0,
      singleSaleThresholdEur: null,
    });

    expect(result.marginEur).toBe(-30);
    expect(result.belowSingleSaleThreshold).toBe(false);
  });

  it('does not divide by a zero purchase price', () => {
    const result = computeExpectedMargin({
      salePriceEur: 12,
      purchasePriceEur: 0,
      feePercent: 0,
      shippingEur: 1,
      singleSaleThresholdEur: 0,
    });

    expect(result.marginEur).toBe(11);
    expect(result.marginPercent).toBeNull();
    expect(result.belowSingleSaleThreshold).toBe(false);
  });
});
