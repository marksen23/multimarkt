import { inSalesPeriod, parseSalesPeriod, periodRange } from './sales-period';

describe('parseSalesPeriod', () => {
  it('defaults to this month and rejects unknown values', () => {
    expect(parseSalesPeriod(undefined)).toBe('this_month');
    expect(parseSalesPeriod('  ')).toBe('this_month');
    expect(parseSalesPeriod('last_year')).toBe('last_year');
    expect(parseSalesPeriod('quartal')).toBeNull();
  });
});

describe('periodRange', () => {
  const november = new Date('2026-11-27T12:00:00.000Z');

  it('uses the Berlin calendar month, the previous month, and both years', () => {
    expect(periodRange('this_month', november)).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(periodRange('last_month', november)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(periodRange('this_year', november)).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(periodRange('last_year', november)).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
    expect(periodRange('all', november)).toEqual({ from: null, to: null });
  });

  it('rolls January back into December of the previous year', () => {
    const january = new Date('2026-01-15T12:00:00.000Z');
    expect(periodRange('last_month', january)).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(periodRange('last_year', january)).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
  });

  it('keeps 29 February in a leap year', () => {
    const march = new Date('2024-03-01T12:00:00.000Z');
    expect(periodRange('last_month', march)).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    });
  });

  it('follows the Berlin date across midnight UTC', () => {
    const stillJanuaryUtc = new Date('2026-01-31T23:30:00.000Z');
    expect(periodRange('this_month', stillJanuaryUtc)).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });
});

describe('inSalesPeriod', () => {
  const range = { from: '2026-11-01', to: '2026-11-30' };

  it('includes the edges and drops undated sales from a bounded period', () => {
    expect(inSalesPeriod('2026-11-01', range)).toBe(true);
    expect(inSalesPeriod('2026-11-30', range)).toBe(true);
    expect(inSalesPeriod('2026-12-01', range)).toBe(false);
    expect(inSalesPeriod(null, range)).toBe(false);
  });

  it('keeps every sale, including undated ones, when the range is open', () => {
    expect(inSalesPeriod(null, { from: null, to: null })).toBe(true);
    expect(inSalesPeriod('2020-01-01', { from: null, to: null })).toBe(true);
  });
});
