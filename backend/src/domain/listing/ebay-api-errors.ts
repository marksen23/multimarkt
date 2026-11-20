interface EbayErrorEntry {
  errorId?: number;
  message?: string;
}

export function parseEbayErrors(body: unknown): EbayErrorEntry[] {
  if (!body || typeof body !== 'object') return [];
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  return errors.filter((entry): entry is EbayErrorEntry => !!entry && typeof entry === 'object');
}

export function ebayErrorId(body: unknown, errorId: number): EbayErrorEntry | null {
  return parseEbayErrors(body).find((entry) => entry.errorId === errorId) ?? null;
}

export function offerIdFromExistingOfferError(body: unknown): string | null {
  const match = ebayErrorId(body, 25002);
  if (!match) return null;
  const parameters = (match as { parameters?: { name?: string; value?: string }[] }).parameters;
  const offer = parameters?.find((parameter) => parameter.name === 'offerId')?.value?.trim();
  return offer || null;
}

/** Deutsche Meldung für OAuth- und Sell-Antworten. Enthält keine Tokens. */
export function germanEbayHttpError(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const code = String((body as { error?: unknown }).error ?? '');
    if (code === 'invalid_grant') {
      return 'eBay hat das Refresh-Token abgelehnt. EBAY_REFRESH_TOKEN ist abgelaufen, widerrufen oder vom falschen Keyset (Sandbox gegen Production). Lege ein neues User-Token mit sell.inventory und sell.account an.';
    }
    if (code === 'invalid_scope') {
      return 'Das eBay-Token darf keine Angebote anlegen. Beim User-Token die Scopes sell.inventory und sell.account mitgeben und EBAY_REFRESH_TOKEN danach neu setzen.';
    }
    if (code === 'invalid_client') {
      return 'eBay akzeptiert EBAY_CLIENT_ID oder EBAY_CLIENT_SECRET nicht. Beide müssen zum selben Production-Keyset gehören wie das Refresh-Token.';
    }
  }

  if (status === 401) {
    return 'eBay hat den Zugang abgelehnt (401). Prüfe EBAY_CLIENT_ID, EBAY_CLIENT_SECRET und EBAY_REFRESH_TOKEN. Der Token muss zum selben Keyset gehören.';
  }

  const first = parseEbayErrors(body)[0];
  if (first?.message) {
    const id = first.errorId != null ? ` (Fehler ${first.errorId})` : '';
    return `eBay meldet: ${first.message}${id}`;
  }

  return `eBay hat die Anfrage abgelehnt (HTTP ${status}).`;
}
