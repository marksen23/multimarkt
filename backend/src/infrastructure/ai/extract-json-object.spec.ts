import { extractJsonObject } from './extract-json-object';

describe('extractJsonObject', () => {
  it('parses a bare object', () => {
    expect(extractJsonObject('{"median":1}')).toEqual({ median: 1 });
  });

  it('strips a markdown fence and ignores prose around the object', () => {
    expect(extractJsonObject('Hier ist das Ergebnis:\n```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it('returns null for text without an object', () => {
    expect(extractJsonObject('keine daten')).toBeNull();
    expect(extractJsonObject('')).toBeNull();
  });
});
