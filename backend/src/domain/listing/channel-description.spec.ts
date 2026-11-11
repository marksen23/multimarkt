import { buildChannelDescription } from './channel-description';

describe('buildChannelDescription', () => {
  const facts = {
    title: 'Bosch GBH 2-28 F Schlagbohrmaschine',
    condition: 'good',
    missingTokens: [],
    attributes: [
      { key: 'brand', value: 'Bosch' },
      { key: 'model', value: 'GBH 2-28 F' },
      { key: 'category', value: 'Elektronik' },
      { key: 'categoryDetail', value: 'Schlagbohrmaschine' },
      { key: 'spec:Leistung', value: '880 W' },
      { key: 'spec:Spannung', value: '230 V' },
    ],
  };

  it('uses model, article and nameplate specs instead of the coarse category alone', () => {
    const klein = buildChannelDescription('KLEINANZEIGEN', facts);
    const ebay = buildChannelDescription('EBAY', facts);

    expect(klein).toContain('GBH 2-28 F');
    expect(klein).toContain('Schlagbohrmaschine');
    expect(klein).toContain('Leistung 880 W');
    expect(klein).not.toContain('Elektronik');
    expect(ebay).toContain('Bosch · GBH 2-28 F · Schlagbohrmaschine');
    expect(ebay).toContain('Angaben: Leistung 880 W, Spannung 230 V.');
  });
});
