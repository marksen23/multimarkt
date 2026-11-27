import { describe, expect, it } from 'vitest';
import { computeSaleCloseout, suggestedSaleFeeEur } from '../margin/sale-closeout';
import { DEFAULT_CHANNEL_FEE_ASSUMPTIONS } from '../margin/channel-fees';
import {
  buildSalesCsv,
  dac7Line,
  formatCsvAmount,
  profitHint,
  SALES_PERIODS,
  salesCsvFilename,
} from './report';

describe('profit and fees', () => {
  it('subtracts fees, shipping and the purchase price', () => {
    const result = computeSaleCloseout({
      proceedsEur: 40,
      feeEur: 4,
      shippingEur: 5,
      purchasePriceEur: 15,
    });
    expect(result.netEur).toBe(31);
    expect(result.netProfitEur).toBe(16);
  });

  it('leaves the profit empty when the purchase price is missing', () => {
    const result = computeSaleCloseout({
      proceedsEur: 26,
      feeEur: 2.6,
      shippingEur: 4.9,
      purchasePriceEur: null,
    });
    expect(result.netEur).toBe(18.5);
    expect(result.netProfitEur).toBeNull();
  });

  it('suggests the channel assumption and zero for Sonstiges', () => {
    expect(suggestedSaleFeeEur(100, 'eBay', DEFAULT_CHANNEL_FEE_ASSUMPTIONS)).toBe(11);
    expect(suggestedSaleFeeEur(20, 'Vinted', DEFAULT_CHANNEL_FEE_ASSUMPTIONS)).toBe(1.7);
    expect(suggestedSaleFeeEur(30, 'Kleinanzeigen', DEFAULT_CHANNEL_FEE_ASSUMPTIONS)).toBe(0);
    expect(suggestedSaleFeeEur(30, 'Sonstiges', DEFAULT_CHANNEL_FEE_ASSUMPTIONS)).toBe(0);
    expect(suggestedSaleFeeEur(30, 'eBay', null)).toBe(0);
  });
});

describe('period filter', () => {
  it('offers the five calendar ranges in German', () => {
    expect(SALES_PERIODS.map((period) => period.label)).toEqual([
      'Dieser Monat',
      'Letzter Monat',
      'Dieses Jahr',
      'Letztes Jahr',
      'Alle',
    ]);
    expect(SALES_PERIODS.map((period) => period.id)).toEqual([
      'this_month',
      'last_month',
      'this_year',
      'last_year',
      'all',
    ]);
  });
});

describe('DAC7 counter', () => {
  it('states the 30 sales and 2000 euro thresholds without alarm language', () => {
    const open = dac7Line({
      channel: 'eBay',
      salesCount: 4,
      proceedsEur: 180,
      salesThreshold: 30,
      proceedsThresholdEur: 2000,
      thresholdReached: false,
    });
    const reached = dac7Line({
      channel: 'Vinted',
      salesCount: 2,
      proceedsEur: 2000,
      salesThreshold: 30,
      proceedsThresholdEur: 2000,
      thresholdReached: true,
    });

    expect(open).toContain('4 von 30 Verkäufen');
    expect(open).toContain('2.000 €');
    expect(open).not.toMatch(/sofort|Warnung|Pflicht|Finanzamt/i);
    expect(reached).toContain('Zähler erreicht');
    expect(reached).not.toMatch(/sofort|Warnung|Pflicht|Straf/i);
  });
});

describe('profit hint', () => {
  it('explains missing purchase prices calmly', () => {
    expect(profitHint({ salesCount: 0, purchaseMissingCount: 0, netProfitEur: 0 })).toBeNull();
    expect(profitHint({ salesCount: 2, purchaseMissingCount: 1, netProfitEur: 16 })).toContain(
      '1 Verkauf',
    );
    expect(profitHint({ salesCount: 1, purchaseMissingCount: 1, netProfitEur: null })).toContain(
      'Ohne Einkaufspreis',
    );
  });
});

describe('CSV export formatting', () => {
  it('uses a BOM, semicolons and a German decimal comma', () => {
    const csv = buildSalesCsv([
      {
        id: 'item-1',
        title: 'Jacke; "Winter"',
        saleDate: '2026-11-11',
        channel: 'eBay',
        proceedsEur: 40,
        feeEur: 4,
        shippingEur: 5,
        purchasePriceEur: 15,
        netProfitEur: 16,
        buyer: 'Max',
        notes: 'Abholung',
        paymentMethod: 'Bar',
      },
      {
        id: 'item-2',
        title: 'Lampe',
        saleDate: '2026-11-04',
        channel: 'Kleinanzeigen',
        proceedsEur: 20.5,
        feeEur: null,
        shippingEur: null,
        purchasePriceEur: null,
        netProfitEur: null,
        buyer: null,
        notes: null,
        paymentMethod: null,
      },
    ]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith('\uFEFFDatum;Artikel;Kanal;Verkaufspreis EUR;')).toBe(true);
    expect(csv).toContain('11.11.2026;"Jacke; ""Winter""";eBay;40,00;4,00;5,00;15,00;16,00');
    expect(csv).toContain('04.11.2026;Lampe;Kleinanzeigen;20,50;;;;');
    expect(csv).not.toContain('40.00');
    expect(formatCsvAmount(-1.2)).toBe('-1,20');
    expect(salesCsvFilename('this_month', '2026-11-01', '2026-11-30')).toBe(
      'verkaeufe-2026-11-01_2026-11-30.csv',
    );
    expect(salesCsvFilename('all', null, null)).toBe('verkaeufe-alle.csv');
  });
});
