const PRIVATE_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

export function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (PRIVATE_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * eBay lädt Fotos selbst von einer https-Adresse. Lokale `/uploads/…`-Pfade
 * und http-Adressen werden nicht still durch Platzhalter ersetzt.
 */
export function ebayPhotoUrls(urls: string[]): { ok: string[] } | { message: string } {
  const ok = urls.filter(isPublicHttpsUrl);
  if (ok.length > 0) return { ok: ok.slice(0, 24) };
  if (urls.length === 0) {
    return {
      message:
        'Für eBay fehlt ein Foto. eBay übernimmt Bilder nur von einer öffentlichen https-Adresse.',
    };
  }
  return {
    message:
      'eBay übernimmt Fotos nur von einer öffentlichen https-Adresse. Die gespeicherten Fotos liegen lokal oder ohne https. Setze S3_PUBLIC_URL_BASE auf eine öffentliche https-Basis und lade die Fotos erneut hoch.',
  };
}
