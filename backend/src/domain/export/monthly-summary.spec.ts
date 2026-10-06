import { berlinMonth, parseMonth, summarizeMonth } from './monthly-summary';

describe('parseMonth', () => {
  it('uses the last calendar day, including a leap year', () => {
    expect(parseMonth('2026-10')).toEqual({
      month: '2026-10',
      start: '2026-10-01',
      end: '2026-10-31',
    });
    expect(parseMonth('2024-02')).toEqual({
      month: '2024-02',
      start: '2024-02-01',
      end: '2024-02-29',
    });
  });

  it('rejects a month that is not JJJJ-MM', () => {
    expect(parseMonth('Oktober')).toBeNull();
    expect(parseMonth('2026-13')).toBeNull();
    expect(parseMonth('2026-00')).toBeNull();
    expect(parseMonth('2026-1')).toBeNull();
  });
});

describe('berlinMonth', () => {
  it('rolls the calendar month at Berlin midnight', () => {
    // Ende Oktober gilt Winterzeit (UTC+1). 23:30 UTC ist schon der 1. November.
    expect(berlinMonth(new Date('2026-10-31T22:30:00Z'))).toBe('2026-10');
    expect(berlinMonth(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11');
  });
});

describe('summarizeMonth', () => {
  const window = { month: '2026-10', start: '2026-10-01', end: '2026-10-31' };

  it('shows zeros when the month has no purchases and no sales', () => {
    expect(
      summarizeMonth({ window, purchases: [], sales: [], onlineCount: 2 }),
    ).toEqual({
      month: '2026-10',
      monthStart: '2026-10-01',
      monthEnd: '2026-10-31',
      purchasedCount: 0,
      purchasedEur: 0,
      soldCount: 0,
      soldEur: 0,
      marginEur: 0,
      onlineCount: 2,
    });
  });

  it('leaves the sum empty when a purchase or sale has no amount', () => {
    const summary = summarizeMonth({
      window,
      purchases: [{ purchasePriceEur: null }, { purchasePriceEur: 12.5 }],
      sales: [{ proceedsEur: null, netProfitEur: null }],
      onlineCount: 0,
    });

    expect(summary.purchasedCount).toBe(2);
    expect(summary.purchasedEur).toBe(12.5);
    expect(summary.soldCount).toBe(1);
    expect(summary.soldEur).toBeNull();
    expect(summary.marginEur).toBeNull();
  });

  it('keeps a real zero margin when the sale landed on the Einstand', () => {
    const summary = summarizeMonth({
      window,
      purchases: [
        { purchasePriceEur: 10 },
        { purchasePriceEur: 0.1 },
        { purchasePriceEur: 0.2 },
      ],
      sales: [{ proceedsEur: 10, netProfitEur: 0 }],
      onlineCount: 4,
    });

    expect(summary.purchasedEur).toBe(10.3);
    expect(summary.soldEur).toBe(10);
    expect(summary.marginEur).toBe(0);
    expect(summary.onlineCount).toBe(4);
  });
});
