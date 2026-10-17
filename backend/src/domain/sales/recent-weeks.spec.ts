import { buildWeekRows, mondayOnOrBefore, recentWeekStarts } from './recent-weeks';

describe('recentWeekStarts', () => {
  it('uses Berlin calendar weeks ending on the current Monday', () => {
    const tuesday = new Date('2026-10-06T12:00:00+02:00');

    expect(recentWeekStarts(tuesday, 8)).toEqual([
      '2026-08-17',
      '2026-08-24',
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
    ]);
  });

  it('keeps Sunday in the week that started the previous Monday', () => {
    expect(mondayOnOrBefore('2026-10-04')).toBe('2026-09-28');
    const sundayEveningBerlin = new Date('2026-10-04T21:30:00Z');
    expect(recentWeekStarts(sundayEveningBerlin, 1)).toEqual(['2026-09-28']);
  });
});

describe('buildWeekRows', () => {
  it('puts the current week first and leaves weeks without a profit empty', () => {
    const rows = buildWeekRows(
      ['2026-09-28', '2026-10-05'],
      new Map([
        ['2026-10-05', { salesCount: 2, profitCount: 1, netProfitEur: 16 }],
        ['2026-09-28', { salesCount: 1, profitCount: 0, netProfitEur: 0 }],
      ]),
    );

    expect(rows).toEqual([
      { weekStart: '2026-10-05', weekEnd: '2026-10-11', salesCount: 2, netProfitEur: 16 },
      { weekStart: '2026-09-28', weekEnd: '2026-10-04', salesCount: 1, netProfitEur: null },
    ]);
  });

  it('shows a real zero profit when the sale landed on the Einstand', () => {
    const rows = buildWeekRows(
      ['2026-10-05'],
      new Map([['2026-10-05', { salesCount: 1, profitCount: 1, netProfitEur: 0 }]]),
    );

    expect(rows[0].netProfitEur).toBe(0);
  });
});
