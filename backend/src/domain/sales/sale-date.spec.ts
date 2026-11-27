import { resolveSaleDate, saleInstant } from './sale-date';

const now = new Date('2026-11-27T12:00:00.000Z');

describe('resolveSaleDate', () => {
  it('defaults a blank date to today in Berlin', () => {
    expect(resolveSaleDate(undefined, now)).toEqual({ ok: true, date: '2026-11-27' });
    expect(resolveSaleDate('  ', now)).toEqual({ ok: true, date: '2026-11-27' });
  });

  it('accepts today and tomorrow and rejects the day after', () => {
    expect(resolveSaleDate('2026-11-27', now)).toEqual({ ok: true, date: '2026-11-27' });
    expect(resolveSaleDate('2026-11-28', now)).toEqual({ ok: true, date: '2026-11-28' });
    expect(resolveSaleDate('2026-11-29', now).ok).toBe(false);
  });

  it('rejects a day that is not on the calendar', () => {
    expect(resolveSaleDate('2026-02-31', now)).toEqual({
      ok: false,
      message: 'Das Verkaufsdatum muss ein gültiger Tag (JJJJ-MM-TT) sein.',
    });
    expect(resolveSaleDate('26.11.2026', now).ok).toBe(false);
  });

  it('rejects dates before 2000', () => {
    expect(resolveSaleDate('1999-12-31', now).ok).toBe(false);
  });

  it('uses the Berlin day when UTC is still the previous evening', () => {
    const justAfterMidnightBerlin = new Date('2026-01-31T23:30:00.000Z');
    expect(resolveSaleDate(null, justAfterMidnightBerlin)).toEqual({
      ok: true,
      date: '2026-02-01',
    });
  });
});

describe('saleInstant', () => {
  it('stays on the same Berlin calendar day', () => {
    const instant = saleInstant('2026-11-27');
    expect(instant.toISOString()).toBe('2026-11-27T12:00:00.000Z');
  });
});
