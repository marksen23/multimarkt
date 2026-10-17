import {
  channelNetRemainingEur,
  compareChannelsByNet,
  DEFAULT_CHANNEL_FEE_ASSUMPTIONS,
  netRemainingLine,
} from './channel-fees';

describe('channel fee comparison', () => {
  it('leaves the full price when Kleinanzeigen is 0 € and shipping is 0', () => {
    expect(
      channelNetRemainingEur(40, DEFAULT_CHANNEL_FEE_ASSUMPTIONS.KLEINANZEIGEN, 0),
    ).toBe(40);
    expect(netRemainingLine(40)).toBe('bei Verkauf zu diesem Preis bleiben 40.00 €');
  });

  it('subtracts a percentage, a fixed amount, and the shipping flat rate', () => {
    expect(channelNetRemainingEur(40, { percent: 11, fixedEur: 0 }, 1.95)).toBe(33.65);
    expect(channelNetRemainingEur(40, { percent: 5, fixedEur: 0.7 }, 1.95)).toBe(35.35);
    expect(channelNetRemainingEur(9.99, { percent: 11, fixedEur: 0.35 }, 0)).toBe(8.54);
  });

  it('ranks channels by net, not by the order of the offer median', () => {
    const ranked = compareChannelsByNet({
      salePriceEur: 40,
      shippingEur: 1.95,
      channels: DEFAULT_CHANNEL_FEE_ASSUMPTIONS,
    });

    expect(ranked.map((line) => line.key)).toEqual(['KLEINANZEIGEN', 'VINTED', 'EBAY']);
    expect(ranked.map((line) => line.netEur)).toEqual([38.05, 35.35, 33.65]);
  });

  it('keeps Kleinanzeigen before eBay when the nets are equal', () => {
    const ranked = compareChannelsByNet({
      salePriceEur: 20,
      shippingEur: 0,
      channels: {
        KLEINANZEIGEN: { percent: 0, fixedEur: 0 },
        EBAY: { percent: 0, fixedEur: 0 },
        VINTED: { percent: 10, fixedEur: 0 },
      },
    });

    expect(ranked.map((line) => line.key)).toEqual(['KLEINANZEIGEN', 'EBAY', 'VINTED']);
    expect(ranked[0].netEur).toBe(20);
    expect(ranked[2].netEur).toBe(18);
  });
});
