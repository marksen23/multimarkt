import { VaguePhraseDetectorService } from './vague-phrase-detector.service';

describe('VaguePhraseDetectorService', () => {
  const service = new VaguePhraseDetectorService();

  it('flags "guter Zustand" with a concrete suggestion', () => {
    const result = service.detect('Herrenjacke in gutem Zustand, kaum getragen.');
    expect(result.map((r) => r.phrase)).toContain('guter Zustand');
    expect(result[0].suggestion.length).toBeGreaterThan(0);
  });

  it('flags multiple distinct vague phrases in the same text', () => {
    const result = service.detect('Wie neu, keine Mängel, leichte Gebrauchsspuren am Rand.');
    const phrases = result.map((r) => r.phrase);
    expect(phrases).toContain('wie neu');
    expect(phrases).toContain('keine Mängel');
    expect(phrases).toContain('leichte Gebrauchsspuren');
  });

  it('returns an empty array for a concrete, specific description', () => {
    const result = service.detect('Kratzer an der Unterseite (Foto 3), Akku-Kapazität laut Einstellungen 87%, OVP vorhanden.');
    expect(result).toEqual([]);
  });

  it('is case-insensitive', () => {
    const result = service.detect('GUTER ZUSTAND, kaum benutzt.');
    expect(result.map((r) => r.phrase)).toContain('guter Zustand');
  });
});
