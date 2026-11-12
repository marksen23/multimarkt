import { extractJsonObject } from '../../infrastructure/ai/extract-json-object';
import {
  claimsForStorage,
  mapVisionPayload,
  nextItemTitle,
  normalizeCondition,
  sanitizeVisionHint,
  selectVisionImageUrls,
  UNCERTAIN_CONFIDENCE,
} from './vision-listing';

/** Aufgezeichnete Gemini-Antwort für eine Schlagbohrmaschine, inkl. Typenschild. */
const BOSCH_DRILL_RESPONSE = {
  category: { value: 'Elektronik', confidence: 0.91 },
  categoryDetail: { value: 'Schlagbohrmaschine', confidence: 0.93 },
  color: { value: 'Blau', confidence: 0.82 },
  brand: { value: 'Bosch', confidence: 0.97 },
  model: { value: 'GBH 2-28 F', confidence: 0.94 },
  material: { value: 'unbekannt', confidence: 0.4 },
  condition: { value: 'good', confidence: 0.58 },
  size: { value: null, confidence: 0 },
  measurements: { value: 'n/a', confidence: 0.2 },
  functionChecked: { value: null, confidence: 0 },
  notable_features: { value: 'Im Koffer', confidence: 0.77 },
  visible_defects: { value: 'Kratzer am Gehäuse', confidence: 0.64 },
  title: { value: '"Bosch GBH 2-28 F Schlagbohrmaschine blau"', confidence: 0.88 },
  description: {
    value:
      'Gebrauchte Bosch Schlagbohrmaschine GBH 2-28 F in Blau, im Koffer. Am Gehäuse sind Kratzer sichtbar. Ob sie läuft, ist auf den Fotos nicht zu sehen.',
    confidence: 0.73,
  },
  searchTerms: { value: 'Bosch GBH 2-28 F Schlagbohrmaschine', confidence: 0.9 },
  specs: [
    { name: 'Leistung', value: '880 W', confidence: 0.86 },
    { name: 'Spannung', value: '230 V', confidence: 0.42 },
    { name: 'Leistung', value: 'vielleicht 500 W', confidence: 0.2 },
    { name: '', value: 'weglassen', confidence: 0.9 },
    { name: 'Autor', value: 'keine', confidence: 0.8 },
  ],
};

function valueOf(key: string) {
  return mapVisionPayload(BOSCH_DRILL_RESPONSE).attributes.find((claim) => claim.key === key);
}

describe('mapVisionPayload', () => {
  it('maps a recorded drill response onto listing fields and drops placeholders', () => {
    const mapped = mapVisionPayload(BOSCH_DRILL_RESPONSE);

    expect(valueOf('category')).toMatchObject({ value: 'Elektronik', confidence: 0.91 });
    expect(valueOf('categoryDetail')?.value).toBe('Schlagbohrmaschine');
    expect(valueOf('brand')?.value).toBe('Bosch');
    expect(valueOf('model')?.value).toBe('GBH 2-28 F');
    expect(valueOf('material')?.value).toBeNull();
    expect(valueOf('measurements')?.value).toBeNull();
    expect(valueOf('condition')).toMatchObject({ value: 'good', confidence: 0.58 });
    expect(valueOf('condition')!.confidence).toBeLessThan(UNCERTAIN_CONFIDENCE);
    expect(valueOf('title')?.value).toBe('Bosch GBH 2-28 F Schlagbohrmaschine blau');
    expect(valueOf('description')?.value).toMatch(/Kratzer/);
    expect(valueOf('searchTerms')?.value).toBe('Bosch GBH 2-28 F Schlagbohrmaschine');
    expect(mapped.attributes.filter((claim) => claim.key === 'spec:Leistung')).toEqual([
      { key: 'spec:Leistung', value: '880 W', confidence: 0.86 },
    ]);
    expect(valueOf('spec:Spannung')).toMatchObject({ value: '230 V', confidence: 0.42 });
    expect(mapped.attributes.some((claim) => claim.key === 'spec:Autor')).toBe(false);
    expect(mapped.attributes.every((claim) => claim.value !== 'unbekannt')).toBe(true);
  });

  it('reads a markdown-fenced answer and German keys without inventing the missing fields', () => {
    const text = [
      'Hier die Analyse:',
      '```json',
      JSON.stringify({
        kategorie: { value: 'Kleidung', confidence: 0.84 },
        titel: { value: 'Herren Lederjacke schwarz L', confidence: 0.8 },
        marke: 'keine Marke',
        zustand: 'Wie neu',
      }),
      '```',
    ].join('\n');

    const mapped = mapVisionPayload(extractJsonObject(text)!);
    expect(mapped.attributes.find((claim) => claim.key === 'category')?.value).toBe('Kleidung');
    expect(mapped.attributes.find((claim) => claim.key === 'title')?.value).toBe('Herren Lederjacke schwarz L');
    expect(mapped.attributes.find((claim) => claim.key === 'brand')?.value).toBeNull();
    expect(mapped.attributes.find((claim) => claim.key === 'condition')?.value).toBe('like_new');
    expect(mapped.attributes.find((claim) => claim.key === 'model')?.value).toBeNull();
  });

  it('accepts a bare string and marks it uncertain', () => {
    const brand = mapVisionPayload({ brand: 'Bosch' }).attributes.find((claim) => claim.key === 'brand');
    expect(brand).toMatchObject({ value: 'Bosch', confidence: 0.5 });
    expect(brand!.confidence).toBeLessThan(UNCERTAIN_CONFIDENCE);
  });

  it('builds search terms from brand, model and article when the model forgot them', () => {
    const search = mapVisionPayload({
      brand: { value: 'Bosch', confidence: 0.9 },
      model: { value: 'GBH 2-28 F', confidence: 0.4 },
      categoryDetail: { value: 'Schlagbohrmaschine', confidence: 0.8 },
    }).attributes.find((claim) => claim.key === 'searchTerms');

    expect(search?.value).toBe('Bosch GBH 2-28 F Schlagbohrmaschine');
    expect(search?.confidence).toBe(0.4);
  });

  it('does not turn an empty object into a product', () => {
    const mapped = mapVisionPayload({});
    expect(mapped.attributes.filter((claim) => claim.value)).toEqual([]);
  });

  it('rejects condition phrases that are not the enum', () => {
    expect(normalizeCondition('Gut')).toBe('good');
    expect(normalizeCondition('Gebraucht')).toBe('fair');
    expect(normalizeCondition('sehr gut')).toBe('like_new');
    expect(normalizeCondition('Defekt')).toBe('defective');
    expect(normalizeCondition('Neu')).toBe('new');
    expect(normalizeCondition('fantastisch')).toBeNull();
    expect(normalizeCondition('nicht defekt')).toBeNull();
  });
});

describe('claimsForStorage', () => {
  it('keeps model, specs and the German title and asks the open electronics facts', () => {
    const stored = claimsForStorage(mapVisionPayload(BOSCH_DRILL_RESPONSE).attributes);
    const byKey = new Map(stored.map((claim) => [claim.key, claim.value]));

    expect(byKey.get('category')).toBe('Elektronik');
    expect(byKey.get('model')).toBe('GBH 2-28 F');
    expect(byKey.get('title')).toBe('Bosch GBH 2-28 F Schlagbohrmaschine blau');
    expect(byKey.get('spec:Leistung')).toBe('880 W');
    expect(byKey.get('spec:Spannung')).toBe('230 V');
    expect(byKey.get('functionChecked')).toBeNull();
    expect(byKey.has('material')).toBe(false);
    expect(stored.filter((claim) => claim.key === 'model')).toHaveLength(1);
  });

  it('turns a tool name used as category into Elektronik plus the article type', () => {
    const stored = claimsForStorage(
      mapVisionPayload({ category: { value: 'Schlagbohrmaschine', confidence: 0.7 } }).attributes,
    );
    const byKey = new Map(stored.map((claim) => [claim.key, claim.value]));
    expect(byKey.get('category')).toBe('Elektronik');
    expect(byKey.get('categoryDetail')).toBe('Schlagbohrmaschine');
  });
});

describe('nextItemTitle', () => {
  it('fills an empty title and leaves a title the seller typed', () => {
    expect(
      nextItemTitle({
        current: null,
        previousAiTitle: null,
        previousConfirmed: false,
        suggested: 'Bosch GBH 2-28 F',
      }),
    ).toBe('Bosch GBH 2-28 F');
    expect(
      nextItemTitle({
        current: 'Mein Bohrer',
        previousAiTitle: null,
        previousConfirmed: false,
        suggested: 'Bosch GBH 2-28 F',
      }),
    ).toBe('Mein Bohrer');
  });

  it('replaces the previous AI title and keeps a confirmed one', () => {
    expect(
      nextItemTitle({
        current: 'Bosch Bohrer',
        previousAiTitle: 'Bosch Bohrer',
        previousConfirmed: false,
        suggested: 'Bosch GBH 2-28 F Schlagbohrmaschine',
      }),
    ).toBe('Bosch GBH 2-28 F Schlagbohrmaschine');
    expect(
      nextItemTitle({
        current: 'Mein Bohrer',
        previousAiTitle: 'Mein Bohrer',
        previousConfirmed: true,
        suggested: 'Bosch GBH 2-28 F',
      }),
    ).toBe('Mein Bohrer');
  });
});

describe('vision input helpers', () => {
  it('keeps the first photos and the last two when there are more than eight', () => {
    const urls = Array.from({ length: 10 }, (_, index) => `p${index}.jpg`);
    expect(selectVisionImageUrls(urls)).toEqual([
      'p0.jpg',
      'p1.jpg',
      'p2.jpg',
      'p3.jpg',
      'p4.jpg',
      'p5.jpg',
      'p8.jpg',
      'p9.jpg',
    ]);
  });

  it('strips control characters from a seller hint and caps the length', () => {
    expect(sanitizeVisionHint('  es ist eine\u0000 Bosch Bohrmaschine  ')).toBe('es ist eine Bosch Bohrmaschine');
    expect(sanitizeVisionHint('a')).toBeNull();
    expect(sanitizeVisionHint('x'.repeat(250))?.length).toBe(200);
    expect(sanitizeVisionHint(undefined)).toBeNull();
  });
});
