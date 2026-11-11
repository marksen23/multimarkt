import { useEffect, useState } from 'react';
import { systemApi } from '../api/system';
import type { IntegrationStatus } from '../api/types';
import { Notice } from '../ui';

/**
 * Sichtbar, solange Bildanalyse oder Vergleichssuche ohne echten
 * Schlüssel laufen. Die Oberfläche erfindet dann keine Preise.
 */
export function IntegrationBanner({ verbose = false }: { verbose?: boolean }) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);

  useEffect(() => {
    let active = true;
    systemApi
      .integrations()
      .then((next) => {
        if (active) setStatus(next);
      })
      .catch(() => {
        if (active) setStatus(null);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!status) return null;
  if (status.geminiLive && status.ebayLive) {
    if (!verbose) return null;
    return (
      <Notice tone="info">
        Gemini und eBay sind aktiv. Ankaufportale haben keine Schnittstelle, ihr Richtwert bleibt ein Beispiel.
      </Notice>
    );
  }

  const missing: string[] = [];
  if (!status.geminiLive) missing.push('Gemini');
  if (!status.ebayLive) missing.push('eBay');

  return (
    <Notice tone="warning">
      <span>
        {missing.join(' und ')} {missing.length === 1 ? 'fehlt' : 'fehlen'}. Fotos, Preise und die Ankaufsuche
        liefern dann keine echten Treffer — nur Links, die du selbst öffnest.
        {verbose && (
          <span className="block mt-1 font-normal">
            {!status.geminiLive && (
              <>
                Bildanalyse und Ankauf: <code>GEMINI_API_KEY</code> aus{' '}
                <a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                  Google AI Studio
                </a>
                .{' '}
              </>
            )}
            {!status.ebayLive && (
              <>
                Aktive eBay-Angebote: <code>EBAY_CLIENT_ID</code> und <code>EBAY_CLIENT_SECRET</code> (Production
                App ID und Cert ID) unter{' '}
                <a className="underline" href="https://developer.ebay.com/my/keys" target="_blank" rel="noopener noreferrer">
                  eBay Developer
                </a>
                .{' '}
              </>
            )}
            In Coolify bei der App unter Environment Variables eintragen und neu deployen. Nicht ins Git.
          </span>
        )}
      </span>
    </Notice>
  );
}
