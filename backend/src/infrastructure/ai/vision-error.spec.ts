import { publicVisionError, redactSecrets } from './vision-error';

describe('publicVisionError', () => {
  it('explains a rejected key without echoing it', () => {
    const message = publicVisionError(
      new Error('API key not valid: AIzaSySecretKeyValue GEMINI_API_KEY=super-secret-key'),
      'super-secret-key',
    );
    expect(message).toMatch(/gültigen GEMINI_API_KEY/);
    expect(message).not.toContain('super-secret-key');
    expect(message).not.toContain('AIzaSy');
  });

  it('explains an empty quota', () => {
    expect(publicVisionError(new Error('429 RESOURCE_EXHAUSTED'))).toMatch(/Kontingent/);
  });

  it('keeps our own format error and redacts a leftover key in other failures', () => {
    const format = 'Gemini hat geantwortet, aber nicht im erwarteten Format. Bitte die Analyse erneut starten. Die Fotos bleiben gespeichert.';
    expect(publicVisionError(new Error(format))).toBe(format);
    const message = publicVisionError(new Error('model gemini-x not found, key super-secret-key'), 'super-secret-key');
    expect(message).toMatch(/nicht analysiert/);
    expect(message).toContain('model gemini-x not found');
    expect(message).not.toContain('super-secret-key');
    expect(redactSecrets('AIzaSyAbcdefghijklmnop was used')).not.toContain('AIzaSy');
  });
});
