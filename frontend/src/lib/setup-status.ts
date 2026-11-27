import type { IntegrationStatus } from '../api/types';

export type SetupState = 'ready' | 'missing' | 'info';

export interface SetupRow {
  id: string;
  title: string;
  state: SetupState;
  stateLabel: string;
  summary: string;
  detail: string;
  missing: string[];
  href?: string;
  linkLabel?: string;
}

const GEMINI_URL = 'https://aistudio.google.com/apikey';
const EBAY_URL = 'https://developer.ebay.com/my/keys';

export function setupRows(status: IntegrationStatus): SetupRow[] {
  return [
    {
      id: 'gemini',
      title: 'Fotos lesen',
      state: status.geminiLive ? 'ready' : 'missing',
      stateLabel: status.geminiLive ? 'Bereit' : 'Fehlt',
      summary: status.geminiLive
        ? 'Die KI kann Fotos lesen und Titel, Modell und Beschreibung vorschlagen. Unsicheres wird markiert. Unscharfe, dunkle oder angeschnittene Fotos bekommen einen kurzen Tipp.'
        : 'Ohne Schlüssel liest niemand die Fotos. Die Felder bleiben leer, bis du sie selbst einträgst. Es werden keine Beispielwerte eingesetzt. Die Foto-Verbesserung läuft trotzdem, der Tipp kommt dann aus der Pixelprüfung.',
      detail: status.geminiLive
        ? 'Der Schlüssel liegt in Coolify, nicht in der App.'
        : 'In Coolify die Variable GEMINI_API_KEY setzen. Den Schlüssel legst du in Google AI Studio an. Danach die App neu starten.',
      missing: [],
      href: status.geminiLive ? undefined : GEMINI_URL,
      linkLabel: status.geminiLive ? undefined : 'Schlüssel anlegen',
    },
    {
      id: 'ebay-prices',
      title: 'Vergleichspreise',
      state: status.ebayLive ? 'ready' : 'missing',
      stateLabel: status.ebayLive ? 'Bereit' : 'Fehlt',
      summary: status.ebayLive
        ? 'Aktive Angebote auf eBay.de können den Schnellverkaufspreis stützen. Abgeschlossene Verkäufe liefert diese Suche nicht.'
        : 'Ohne die beiden eBay-Schlüssel gibt es keine Vergleichspreise. Du bekommst Links und suchst selbst. Es werden keine Preise erfunden.',
      detail: status.ebayLive
        ? 'Dafür reichen App ID und Cert ID. Zum Einstellen verbindest du das Verkäuferkonto oben auf dieser Seite.'
        : 'EBAY_CLIENT_ID und EBAY_CLIENT_SECRET: Production App ID und Cert ID. Ein Sandbox-Schlüssel sieht den echten Markt nicht.',
      missing: [],
      href: status.ebayLive ? undefined : EBAY_URL,
      linkLabel: status.ebayLive ? undefined : 'eBay-Schlüssel öffnen',
    },
    {
      id: 'photos',
      title: 'Fotos speichern',
      state: status.photoStorageDurable ? 'ready' : 'missing',
      stateLabel: status.photoStorageDurable ? 'Bereit' : 'Fehlt',
      summary: status.photoStorageDurable
        ? 'Fotos bleiben gespeichert, auch nach einem Neustart der App.'
        : 'Fotos liegen nur auf dem Server. Ein Neustart kann sie löschen. Die Artikel in der Liste bleiben, die Bilder dann nicht.',
      detail: status.photoStorageDurable
        ? 'Der Speicher ist ein S3-kompatibler Bucket.'
        : 'Für dauerhafte Fotos brauchst du einen S3-kompatiblen Speicher, zum Beispiel Cloudflare R2. Dafür setzt du S3_BUCKET und die Zugangsdaten.',
      missing: [],
    },
    {
      id: 'buyback',
      title: 'Ankaufportale',
      state: 'info',
      stateLabel: 'Hinweis',
      summary: 'Portale wie momox haben hier keine Schnittstelle. Ein Richtwert ist ein Beispiel und kein Marktpreis.',
      detail: 'Die Suche dort ändert deine Schmerzgrenze nicht.',
      missing: [],
    },
  ];
}

export function setupOpenCount(rows: SetupRow[]): number {
  return rows.filter((row) => row.state === 'missing').length;
}

/** Die eBay-Karte zählt extra, sie steht nicht mehr in der allgemeinen Liste. */
export function einrichtungOpenCount(rows: SetupRow[], ebayPublishReady: boolean): number {
  return setupOpenCount(rows) + (ebayPublishReady ? 0 : 1);
}
