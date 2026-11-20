export type MarketSearchErrorCode = 'MISSING_KEYS' | 'AUTH' | 'RATE_LIMIT' | 'UNAVAILABLE';

/**
 * Fehler der eBay-Suche, den die Oberfläche auf Deutsch zeigen darf.
 * Die Meldung enthält keine Schlüssel und keine Antwortkörper.
 */
export class MarketSearchError extends Error {
  readonly code: MarketSearchErrorCode;

  constructor(code: MarketSearchErrorCode, message: string) {
    super(message);
    this.name = 'MarketSearchError';
    this.code = code;
  }
}

export const EBAY_MISSING_KEYS_MESSAGE =
  'eBay-Schlüssel fehlen. Trag EBAY_CLIENT_ID und EBAY_CLIENT_SECRET in Coolify ein (Production, App ID und Cert ID, nicht Sandbox) und deploye neu. Ohne sie gibt es keine Vergleichspreise.';

export const EBAY_AUTH_MESSAGE =
  'eBay hat die Schlüssel abgelehnt. Prüfe App ID und Cert ID unter Production, nicht Sandbox.';

export const EBAY_RATE_LIMIT_MESSAGE =
  'eBay-Limit erreicht. Bitte in ein paar Minuten erneut abrufen.';

export const EBAY_UNAVAILABLE_MESSAGE =
  'Die eBay-Suche ist gerade nicht erreichbar. Die Links unten öffnen dieselbe Suche.';

export function ebayHttpError(status: number): MarketSearchError {
  if (status === 401 || status === 403) return new MarketSearchError('AUTH', EBAY_AUTH_MESSAGE);
  if (status === 429) return new MarketSearchError('RATE_LIMIT', EBAY_RATE_LIMIT_MESSAGE);
  return new MarketSearchError('UNAVAILABLE', `${EBAY_UNAVAILABLE_MESSAGE} (Antwort ${status}).`);
}

export function marketSearchMessage(error: unknown): string {
  if (error instanceof MarketSearchError) return error.message;
  return EBAY_UNAVAILABLE_MESSAGE;
}
