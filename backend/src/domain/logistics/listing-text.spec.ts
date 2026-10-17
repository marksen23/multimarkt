import { applyLogisticsListingText } from './listing-text';
import type { LogisticsProfile } from './logistics-profile';

const smallParcel: LogisticsProfile = {
  captured: true,
  weightGrams: 180,
  lengthCm: 22,
  widthCm: 16,
  heightCm: 2,
  bulky: false,
  pickupOnly: false,
  shippingPossible: true,
  postalCode: '10115',
};

const sofa: LogisticsProfile = {
  captured: true,
  weightGrams: 45_000,
  lengthCm: 210,
  widthCm: 95,
  heightCm: 85,
  bulky: true,
  pickupOnly: true,
  shippingPossible: false,
  postalCode: '10115',
};

describe('listing text templates', () => {
  it('gives a small parcel shipping text and no pickup-only wording', () => {
    const text = applyLogisticsListingText({
      body: 'Sofort abholbar am Bahnhof. Kaum benutzt.',
      title: 'Briefumschlag',
      condition: 'Gut',
      profile: smallParcel,
    });

    expect(text).toMatch(/Versand möglich/);
    expect(text).not.toMatch(/abholung|abholbar|selbstabhol/i);
    expect(text).toContain('Kaum benutzt.');
    expect(text).toContain('180 g');
    expect(text).toContain('22 × 16 × 2 cm');
  });

  it('gives a sofa pickup text with the postal code and no shipping offer', () => {
    const text = applyLogisticsListingText({
      body: 'Versand möglich, gerne verschickt.',
      title: 'Sofa',
      condition: 'Gebraucht',
      profile: sofa,
    });

    expect(text).toMatch(/Nur Abholung in 10115/);
    expect(text).toContain('Kein Versand.');
    expect(text).not.toMatch(/Versand möglich/);
    expect(text).not.toMatch(/verschick/);
    expect(text).toContain('45 kg');
    expect(text).toContain('210 × 95 × 85 cm');
  });

  it('leaves the text unchanged until a profile is saved', () => {
    const body = 'Herrenjacke — Zustand: good';
    expect(
      applyLogisticsListingText({
        body,
        title: 'Herrenjacke',
        condition: 'good',
        profile: { ...smallParcel, captured: false },
      }),
    ).toBe(body);
  });
});
