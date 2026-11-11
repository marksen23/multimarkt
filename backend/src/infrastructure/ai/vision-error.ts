/**
 * Meldungen für die Oberfläche. Der Rohtext von Gemini kann den Schlüssel
 * oder ein langes Request-Dump enthalten und bleibt im Log, nicht im UI.
 */
export function publicVisionError(error: unknown, apiKey?: string | null): string {
  const raw = error instanceof Error ? error.message : '';
  if (/nicht im erwarteten Format|Foto nicht lesbar/.test(raw)) return raw;
  if (/API key|API_KEY_INVALID|UNAUTHENTICATED|permission denied|\b401\b/i.test(raw)) {
    return 'Gemini lehnt den Schlüssel ab. Trag einen gültigen GEMINI_API_KEY aus Google AI Studio ein und starte die App neu. Die Fotos bleiben gespeichert.';
  }
  if (/quota|RESOURCE_EXHAUSTED|\b429\b|rate limit/i.test(raw)) {
    return 'Das Gemini-Kontingent ist aufgebraucht. In Google AI Studio nachsehen und die Analyse später erneut starten. Die Fotos bleiben gespeichert.';
  }
  const reason = briefReason(raw, apiKey);
  if (reason) {
    return `Gemini hat die Fotos nicht analysiert (${reason}). Prüfe GEMINI_API_KEY, das Kontingent und optional GEMINI_VISION_MODEL. Die Fotos bleiben gespeichert.`;
  }
  return 'Gemini hat die Fotos nicht analysiert. Prüfe GEMINI_API_KEY und das Kontingent in Google AI Studio. Die Fotos bleiben gespeichert.';
}

export function redactSecrets(value: string, apiKey?: string | null): string {
  let text = value.replace(/\s+/g, ' ').trim();
  text = text.replace(/AIza[0-9A-Za-z_-]{8,}/g, '***');
  if (apiKey && apiKey.length > 4) text = text.split(apiKey).join('***');
  return text;
}

function briefReason(raw: string, apiKey?: string | null): string | null {
  const text = redactSecrets(raw, apiKey);
  if (!text || text.length < 8) return null;
  return text.slice(0, 160);
}
