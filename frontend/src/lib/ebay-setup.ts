import type { EbaySetupView, EbayValueSource } from '../api/types';

export type EbayStepState = 'done' | 'current' | 'todo';

export interface EbayStep {
  id: 'keys' | 'account' | 'policies' | 'ready';
  label: string;
  state: EbayStepState;
}

const STEP_LABELS: Array<{ id: EbayStep['id']; label: string }> = [
  { id: 'keys', label: 'App-Schlüssel' },
  { id: 'account', label: 'eBay-Konto verbunden' },
  { id: 'policies', label: 'Geschäftsrichtlinien und Standort' },
  { id: 'ready', label: 'Bereit zum Einstellen' },
];

export function ebaySetupSteps(view: EbaySetupView): EbayStep[] {
  const keys = view.clientIdReady && view.clientSecretReady && view.ruNameReady;
  const account = view.connected && view.health !== 'error' && !view.refreshExpired;
  const policies = Boolean(
    view.selection.fulfillmentPolicyId &&
      view.selection.paymentPolicyId &&
      view.selection.returnPolicyId &&
      view.selection.merchantLocationKey,
  );
  const flags = [keys, account, policies, view.publishReady];
  const current = flags.findIndex((done) => !done);
  return STEP_LABELS.map((step, index) => ({
    ...step,
    state: flags[index] ? 'done' : index === current ? 'current' : 'todo',
  }));
}

export function sourceLabel(source: EbayValueSource): string | null {
  if (source === 'database') return 'Gespeichert in der App';
  if (source === 'environment') return 'Aus Coolify';
  return null;
}

export function formatGermanDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(date);
}

const RETURN_NOTICES: Record<string, { tone: 'info' | 'danger'; text: string }> = {
  verbunden: { tone: 'info', text: 'Das eBay-Konto ist verbunden. Als Nächstes die Richtlinien und den Standort wählen.' },
  abgelaufen: { tone: 'danger', text: 'Die Verbindung ist abgelaufen. Tippe noch einmal auf „Mit eBay verbinden“.' },
  abgelehnt: { tone: 'danger', text: 'Du hast den Zugriff auf eBay abgelehnt.' },
  austausch: {
    tone: 'danger',
    text: 'eBay hat den Zugang nicht bestätigt. Prüfe, ob die RuName-Adresse auf diese App zeigt, und versuche es erneut.',
  },
  schluessel: { tone: 'danger', text: 'App-Schlüssel, RuName oder JWT_SECRET fehlen in Coolify.' },
  unbekannt: { tone: 'danger', text: 'Die Verbindung hat nicht geklappt. Versuch es noch einmal.' },
};

/** Nur bekannte Gründe. Ein fremder Query-Text wird nicht angezeigt. */
export function ebayReturnNotice(params: URLSearchParams): { tone: 'info' | 'danger'; text: string } | null {
  const ebay = params.get('ebay');
  if (ebay === 'verbunden') return RETURN_NOTICES.verbunden;
  if (ebay !== 'fehler') return null;
  const grund = params.get('grund') ?? '';
  return RETURN_NOTICES[grund] ?? RETURN_NOTICES.unbekannt;
}

export function isEbayAuthorizeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.host === 'auth.ebay.com' || url.host === 'auth.sandbox.ebay.com') &&
      url.pathname === '/oauth2/authorize'
    );
  } catch {
    return false;
  }
}
