import {
  counterPrice,
  formatEuro,
  offerPosition,
  parseGermanAmount,
  parseOffer,
  suggestNegotiation,
} from './negotiation';

describe('parseGermanAmount', () => {
  it('reads German and grouped amounts', () => {
    expect(parseGermanAmount('80')).toBe(80);
    expect(parseGermanAmount('80,50')).toBe(80.5);
    expect(parseGermanAmount('1.200')).toBe(1200);
    expect(parseGermanAmount('1.200,50')).toBe(1200.5);
    expect(parseGermanAmount('1,200.50')).toBe(1200.5);
  });
});

describe('parseOffer', () => {
  it('reads a currency amount and ignores pickup time and postal code', () => {
    expect(
      parseOffer(
        'Hallo, ich biete 80€ und komme es heute Abend direkt abholen. Barzahlung. LG',
      ),
    ).toBe(80);
    expect(parseOffer('Was letzte Preis? 80€?')).toBe(80);
    expect(parseOffer('Hallo, wäre 65 Euro okay? PLZ 10115')).toBe(65);
    expect(parseOffer('ca. 1.200,50 €')).toBe(1200.5);
  });

  it('reads an amount next to an offer verb without a currency sign', () => {
    expect(parseOffer('Ich würde 70 zahlen')).toBe(70);
    expect(parseOffer('Kannst du für 50 lassen?')).toBe(50);
    expect(parseOffer('Was letzte Preis? 80')).toBe(80);
  });

  it('prefers the bid over shipping and size', () => {
    expect(parseOffer('500GB für 40€')).toBe(40);
    expect(parseOffer('ich biete 80€, Versand 4,90€')).toBe(80);
    expect(parseOffer('100€, ich biete 80€')).toBe(80);
    expect(parseOffer('Versand 4,90€')).toBeNull();
  });

  it('does not invent an offer from a question, a time, or two amounts', () => {
    expect(parseOffer('Hallo, ist der Artikel noch da?')).toBeNull();
    expect(parseOffer('Heute um 18 Uhr')).toBeNull();
    expect(parseOffer('80 und 90')).toBeNull();
    expect(parseOffer('PLZ 10115')).toBeNull();
    expect(parseOffer('Größe 42')).toBeNull();
  });

  it('reads a message that is only the price', () => {
    expect(parseOffer('80')).toBe(80);
    expect(parseOffer('80?')).toBe(80);
    expect(parseOffer('ca. 90')).toBe(90);
  });
});

describe('counterPrice', () => {
  it('splits the gap and stays at or above the pain threshold', () => {
    expect(counterPrice(80, 95, 120)).toBe(100);
    expect(counterPrice(90, 95, 120)).toBe(105);
    expect(counterPrice(50, 95, 100)).toBe(95);
    expect(counterPrice(119, 95, 120)).toBe(120);
  });

  it('does not undercut an offer that already clears both prices', () => {
    expect(counterPrice(130, 95, 120)).toBe(120);
    expect(counterPrice(30, 50, 40)).toBe(50);
  });
});

describe('suggestNegotiation', () => {
  it('recommends a polite decline below the pain threshold and still offers a counter', () => {
    const draft = suggestNegotiation({
      message: 'Hallo, ich biete 80€ und komme es heute Abend direkt abholen.',
      minPrice: 95,
      targetPrice: 120,
      platform: 'KLEINANZEIGEN',
    });

    expect(draft.offer).toBe(80);
    expect(draft.position).toBe('BELOW_MIN');
    expect(offerPosition(80, 95, 120)).toBe('BELOW_MIN');
    expect(draft.assessment).toBe(
      'Das Gebot 80 € liegt 15 € unter der Schmerzgrenze 95 €. Zielpreis 120 €.',
    );
    expect(draft.replies.map((reply) => reply.id)).toEqual([
      'accept',
      'counter',
      'decline',
    ]);
    expect(draft.replies.map((reply) => reply.recommended)).toEqual([
      false,
      false,
      true,
    ]);
    expect(draft.replies[0]).toMatchObject({
      label: 'Annehmen: 80 €',
      text: 'Hallo, danke für dein Angebot. 80 € passt. Abholung passt. Wann passt es dir?',
      price: 80,
    });
    expect(draft.replies[1]).toMatchObject({
      label: 'Gegenangebot: 100 €',
      price: 100,
      text: 'Hallo, danke für dein Angebot. 80 € ist mir zu wenig. Für 100 € können wir uns einigen. Abholung passt. Wie sieht es aus?',
    });
    expect(draft.replies[2].text).toBe(
      'Hallo, danke für dein Angebot. 80 € ist mir leider zu wenig. Viel Erfolg bei der weiteren Suche!',
    );
  });

  it('recommends a counter between the pain threshold and the target', () => {
    const draft = suggestNegotiation({
      message: 'Ich würde 110 Euro zahlen. Versand möglich?',
      minPrice: 95,
      targetPrice: 120,
      platform: 'VINTED',
    });

    expect(draft.platform).toBe('VINTED');
    expect(draft.position).toBe('BETWEEN');
    expect(draft.replies.find((reply) => reply.recommended)?.id).toBe(
      'counter',
    );
    expect(draft.replies[1].text).toContain(
      'Bei 115 € können wir uns einigen.',
    );
    expect(draft.replies[1].text).toContain('Versand können wir klären.');
  });

  it('recommends accepting an offer at or above the target without undercutting it', () => {
    const draft = suggestNegotiation({
      message: '130€',
      minPrice: 95,
      targetPrice: 120,
      platform: 'EBAY',
    });

    expect(draft.position).toBe('AT_OR_ABOVE_TARGET');
    expect(draft.replies.find((reply) => reply.recommended)?.id).toBe('accept');
    expect(draft.replies[1].label).toBe('Gegenangebot unnötig');
    expect(draft.replies[1].text).toContain('Ich bleibe bei 130 €');
    expect(draft.replies[1].text).not.toContain('120 €');
    expect(draft.replies[2].text).toContain(
      'Ich verkaufe den Artikel doch nicht.',
    );
  });

  it('does not invent a bid when the message has no amount', () => {
    const draft = suggestNegotiation({
      message: 'Hallo, ist der Artikel noch da?',
      minPrice: 95,
      targetPrice: 120,
      platform: 'KLEINANZEIGEN',
    });

    expect(draft.offer).toBeNull();
    expect(draft.position).toBe('NO_OFFER');
    expect(draft.assessment).toContain('Es wird kein Gebot erfunden.');
    expect(draft.replies.every((reply) => reply.recommended === false)).toBe(
      true,
    );
    expect(draft.replies[0].label).toBe('Zielpreis zusagen: 120 €');
    expect(draft.replies[1].label).toBe('Gegenangebot: 95 €');
    expect(formatEuro(95.5)).toBe('95,50 €');
  });
});
