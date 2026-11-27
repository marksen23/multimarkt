import {
  buildSalesCsv,
  canonicalChannel,
  dac7Progress,
  DAC7_PROCEEDS_THRESHOLD_EUR,
  DAC7_SALES_THRESHOLD,
  feesAndShippingEur,
  formatCsvAmount,
  rowProfitEur,
  SaleLedgerRow,
  summarizeSales,
} from './sales-report';

function row(overrides: Partial<SaleLedgerRow> = {}): SaleLedgerRow {
  return {
    id: 'item-1',
    title: 'Jacke',
    saleDate: '2026-11-11',
    createdOn: '2026-11-01',
    channel: 'eBay',
    proceedsEur: 40,
    feeEur: 4,
    shippingEur: 5,
    purchasePriceEur: 15,
    netProfitEur: 16,
    buyer: null,
    notes: null,
    paymentMethod: null,
    ...overrides,
  };
}

describe('fees and profit', () => {
  it('adds fee and shipping after rounding each amount', () => {
    expect(feesAndShippingEur(4, 5)).toBe(9);
    expect(feesAndShippingEur(0.335, 0.335)).toBe(0.68);
    expect(feesAndShippingEur(null, null)).toBe(0);
  });

  it('uses the stored profit and otherwise subtracts costs from the proceeds', () => {
    expect(rowProfitEur(row({ netProfitEur: 16, purchasePriceEur: 99 }))).toBe(16);
    expect(
      rowProfitEur(
        row({
          netProfitEur: null,
          proceedsEur: 10,
          feeEur: 0.335,
          shippingEur: 0.335,
          purchasePriceEur: 8,
        }),
      ),
    ).toBe(1.32);
    expect(rowProfitEur(row({ netProfitEur: null, purchasePriceEur: null }))).toBeNull();
  });

  it('keeps a loss and ignores a sale without a purchase price in the profit sum', () => {
    const summary = summarizeSales([
      row(),
      row({
        id: 'item-2',
        title: 'Lampe',
        channel: 'Kleinanzeigen',
        saleDate: '2026-11-04',
        createdOn: '2026-11-02',
        proceedsEur: 20,
        feeEur: 0,
        shippingEur: 0,
        purchasePriceEur: null,
        netProfitEur: null,
      }),
      row({
        id: 'item-3',
        title: 'Teller',
        channel: 'Vinted',
        proceedsEur: 10,
        feeEur: 0,
        shippingEur: 0,
        purchasePriceEur: 25,
        netProfitEur: -15,
        saleDate: '2026-11-20',
        createdOn: '2026-11-20',
      }),
    ]);

    expect(summary.kpis).toMatchObject({
      salesCount: 3,
      proceedsEur: 70,
      proceedsMissingCount: 0,
      feesAndShippingEur: 9,
      purchaseCostEur: 40,
      purchaseRecordedCount: 2,
      purchaseMissingCount: 1,
      netProfitEur: 1,
      averageDaysToSale: 4,
      daysToSaleCount: 3,
    });
    expect(summary.channels.map((channel) => channel.channel)).toEqual([
      'eBay',
      'Kleinanzeigen',
      'Vinted',
    ]);
    expect(summary.channels[1]).toMatchObject({
      channel: 'Kleinanzeigen',
      salesCount: 1,
      proceedsEur: 20,
      feesAndShippingEur: 0,
      purchaseCostEur: 0,
      netProfitEur: null,
    });
  });

  it('returns a zero profit for an empty period and clamps negative durations to zero', () => {
    expect(summarizeSales([]).kpis.netProfitEur).toBe(0);
    expect(summarizeSales([]).kpis.averageDaysToSale).toBeNull();
    const backdated = summarizeSales([
      row({ saleDate: '2026-10-01', createdOn: '2026-11-01', netProfitEur: 1, purchasePriceEur: 1 }),
    ]);
    expect(backdated.kpis.averageDaysToSale).toBe(0);
  });

  it('does not let a missing sale price become zero proceeds', () => {
    const summary = summarizeSales([
      row({ proceedsEur: null, feeEur: null, shippingEur: null, netProfitEur: null, purchasePriceEur: null }),
    ]);
    expect(summary.kpis.proceedsEur).toBe(0);
    expect(summary.kpis.proceedsMissingCount).toBe(1);
    expect(summary.kpis.netProfitEur).toBeNull();
  });
});

describe('canonicalChannel', () => {
  it('merges spelling variants and keeps an unknown name', () => {
    expect(canonicalChannel(' EBAY.de ')).toBe('eBay');
    expect(canonicalChannel('kleinanzeigen')).toBe('Kleinanzeigen');
    expect(canonicalChannel('Sonstiges')).toBe('Sonstiges');
    expect(canonicalChannel('')).toBe('Ohne Kanal');
    expect(canonicalChannel('Flohmarkt')).toBe('Flohmarkt');
  });
});

describe('dac7Progress', () => {
  it('counts only the given calendar year and flags 30 sales or 2000 euro', () => {
    const ebay = Array.from({ length: DAC7_SALES_THRESHOLD }, (_, index) =>
      row({
        id: `ebay-${index}`,
        proceedsEur: 10,
        feeEur: 0,
        shippingEur: 0,
        purchasePriceEur: 1,
        netProfitEur: 9,
        saleDate: '2026-03-01',
      }),
    );
    const vinted = row({
      id: 'vinted',
      channel: 'Vinted',
      proceedsEur: DAC7_PROCEEDS_THRESHOLD_EUR,
      feeEur: 0,
      shippingEur: 0,
      purchasePriceEur: null,
      netProfitEur: null,
      saleDate: '2026-08-01',
    });
    const lastYear = row({
      id: 'old',
      channel: 'Kleinanzeigen',
      proceedsEur: 5000,
      saleDate: '2025-12-01',
    });

    const progress = dac7Progress([...ebay, vinted, lastYear], 2026);

    expect(progress.map((entry) => entry.channel)).toEqual(['eBay', 'Vinted']);
    expect(progress[0]).toMatchObject({
      year: 2026,
      salesCount: 30,
      proceedsEur: 300,
      salesReached: true,
      proceedsReached: false,
      thresholdReached: true,
      salesThreshold: 30,
      proceedsThresholdEur: 2000,
    });
    expect(progress[1]).toMatchObject({
      salesCount: 1,
      proceedsEur: 2000,
      salesReached: false,
      proceedsReached: true,
      thresholdReached: true,
    });
  });

  it('stays empty when the year has no dated sales', () => {
    expect(dac7Progress([row({ saleDate: null })], 2026)).toEqual([]);
  });
});

describe('buildSalesCsv', () => {
  it('writes a German Excel file with BOM, semicolon and decimal comma', () => {
    const csv = buildSalesCsv([
      row({
        title: 'Jacke; "Winter"',
        buyer: 'Max',
        notes: 'Abholung\nbar',
        paymentMethod: 'Bar',
      }),
      row({
        id: 'item-2',
        title: 'Lampe',
        channel: 'Kleinanzeigen',
        proceedsEur: 20.5,
        feeEur: null,
        shippingEur: null,
        purchasePriceEur: null,
        netProfitEur: null,
        saleDate: '2026-11-04',
      }),
    ]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.includes('\r\n')).toBe(true);
    expect(csv.startsWith('\uFEFFDatum;Artikel;Kanal;Verkaufspreis EUR;')).toBe(true);
    expect(csv).toContain('"Jacke; ""Winter"""');
    expect(csv).toContain('11.11.2026');
    expect(csv).toContain('40,00;4,00;5,00;15,00;16,00');
    expect(csv).toContain('20,50;;;');
    expect(csv).not.toContain('40.00');
    expect(csv).toContain('"Abholung\nbar"');
    expect(formatCsvAmount(-15)).toBe('-15,00');
    expect(formatCsvAmount(null)).toBe('');
  });
});
