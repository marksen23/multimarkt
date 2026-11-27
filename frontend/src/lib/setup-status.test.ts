import { describe, expect, it } from 'vitest';
import type { IntegrationStatus } from '../api/types';
import { einrichtungOpenCount, setupOpenCount, setupRows } from './setup-status';

function status(patch: Partial<IntegrationStatus> = {}): IntegrationStatus {
  return {
    geminiLive: false,
    ebayLive: false,
    ebayPublishReady: false,
    ebayPublishMissing: ['EBAY_REFRESH_TOKEN fehlt. Das ist das Verkäuferkonto, nicht der Schlüssel der Preissuche.'],
    photoStorageDurable: false,
    buybackLive: false,
    ...patch,
  };
}

describe('setupRows', () => {
  it('explains every missing piece in German and does not invent a configured service', () => {
    const rows = setupRows(status());
    expect(rows.map((row) => [row.id, row.state])).toEqual([
      ['gemini', 'missing'],
      ['ebay-prices', 'missing'],
      ['photos', 'missing'],
      ['buyback', 'info'],
    ]);
    expect(rows.find((row) => row.id === 'gemini')?.summary).toContain('keine Beispielwerte');
    expect(rows.find((row) => row.id === 'ebay-prices')?.summary).toContain('keine Preise erfunden');
    expect(setupOpenCount(rows)).toBe(3);
    expect(einrichtungOpenCount(rows, false)).toBe(4);
    expect(einrichtungOpenCount(rows, true)).toBe(3);
  });

  it('drops the publish gap list once eBay publishing is ready', () => {
    const rows = setupRows(
      status({
        geminiLive: true,
        ebayLive: true,
        ebayPublishReady: true,
        ebayPublishMissing: ['sollte nicht mehr erscheinen'],
        photoStorageDurable: true,
      }),
    );
    expect(setupOpenCount(rows)).toBe(0);
    expect(einrichtungOpenCount(rows, true)).toBe(0);
    expect(rows.find((row) => row.id === 'photos')?.summary).toContain('bleiben gespeichert');
    const text = JSON.stringify(rows);
    expect(text).not.toContain('sollte nicht mehr erscheinen');
    expect(text).not.toMatch(/AIza|secret|token-value/i);
  });
});
