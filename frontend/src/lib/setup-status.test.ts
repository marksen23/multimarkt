import { describe, expect, it } from 'vitest';
import type { IntegrationStatus } from '../api/types';
import { setupOpenCount, setupRows } from './setup-status';

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
      ['ebay-publish', 'missing'],
      ['photos', 'missing'],
      ['buyback', 'info'],
    ]);
    expect(rows.find((row) => row.id === 'gemini')?.summary).toContain('keine Beispielwerte');
    expect(rows.find((row) => row.id === 'ebay-prices')?.summary).toContain('keine Preise erfunden');
    expect(rows.find((row) => row.id === 'ebay-publish')?.missing[0]).toContain('EBAY_REFRESH_TOKEN');
    expect(setupOpenCount(rows)).toBe(4);
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
    expect(rows.find((row) => row.id === 'ebay-publish')?.missing).toEqual([]);
    expect(rows.find((row) => row.id === 'photos')?.summary).toContain('bleiben gespeichert');
    const text = JSON.stringify(rows);
    expect(text).not.toContain('sollte nicht mehr erscheinen');
    expect(text).not.toMatch(/AIza|secret|token-value/i);
  });
});
