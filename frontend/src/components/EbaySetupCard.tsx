import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiRequestError } from '../api/client';
import { systemApi } from '../api/system';
import type { EbayLocationOption, EbayPolicyOption, EbaySelection, EbaySetupView, EbayValueSource } from '../api/types';
import {
  ebayReturnNotice,
  ebaySetupSteps,
  formatGermanDate,
  isEbayAuthorizeUrl,
  sourceLabel,
} from '../lib/ebay-setup';
import { Button, Card, Field, Icon, Notice, inputClass } from '../ui';

const KEYS_URL = 'https://developer.ebay.com/my/keys';
const POLICIES_URL = 'https://www.ebay.de/bp/manage';

type Busy = 'connect' | 'disconnect' | 'save' | 'location' | 'reload' | null;

export function EbaySetupCard({
  setup,
  loading,
  error,
  onChange,
}: {
  setup: EbaySetupView | null;
  loading: boolean;
  error: string | null;
  onChange: (next: EbaySetupView) => void;
}) {
  const [params, setParams] = useSearchParams();
  const returned = ebayReturnNotice(params);
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger' | 'warning'; text: string } | null>(returned);
  const [appliedReturn, setAppliedReturn] = useState(returned?.text ?? '');
  if (returned && returned.text !== appliedReturn) {
    setAppliedReturn(returned.text);
    setNotice(returned);
  }
  const [busy, setBusy] = useState<Busy>(null);
  const [draft, setDraft] = useState<{ setup: EbaySetupView; selection: EbaySelection } | null>(null);
  const selection = draft && setup && draft.setup === setup ? draft.selection : (setup?.selection ?? null);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [location, setLocation] = useState({ name: 'Lager', street: '', postalCode: '', city: '' });

  useEffect(() => {
    if (!params.get('ebay')) return;
    const next = new URLSearchParams(params);
    next.delete('ebay');
    next.delete('grund');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const steps = setup ? ebaySetupSteps(setup) : [];
  const showPolicies = Boolean(setup?.connected && setup.health !== 'error' && setup.policiesOptedIn !== false);

  async function connect() {
    setBusy('connect');
    setNotice(null);
    try {
      const { authorizeUrl } = await systemApi.connectEbay();
      if (!isEbayAuthorizeUrl(authorizeUrl)) {
        setNotice({ tone: 'danger', text: 'Die Anmeldeadresse von eBay ist ungültig. Die Verbindung wurde nicht gestartet.' });
        return;
      }
      window.location.assign(authorizeUrl);
    } catch (caught) {
      setNotice({ tone: 'danger', text: messageOf(caught) });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (
      !window.confirm(
        'Die gespeicherte eBay-Verbindung wird gelöscht. Ein Token in Coolify gilt danach wieder, falls eines gesetzt ist. Bei eBay bleibt die Erlaubnis bestehen, bis du sie dort entfernst.',
      )
    ) {
      return;
    }
    setBusy('disconnect');
    setNotice(null);
    try {
      onChange(await systemApi.disconnectEbay());
      setNotice({ tone: 'info', text: 'Die Verbindung in der App ist getrennt.' });
    } catch (caught) {
      setNotice({ tone: 'danger', text: messageOf(caught) });
    } finally {
      setBusy(null);
    }
  }

  async function reload() {
    setBusy('reload');
    setNotice(null);
    try {
      onChange(await systemApi.ebay());
    } catch (caught) {
      setNotice({ tone: 'danger', text: messageOf(caught) });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!selection) return;
    setBusy('save');
    setNotice(null);
    try {
      onChange(await systemApi.saveEbaySelection(selection));
      setNotice({ tone: 'info', text: 'Die Auswahl ist gespeichert.' });
    } catch (caught) {
      setNotice({ tone: 'danger', text: messageOf(caught) });
    } finally {
      setBusy(null);
    }
  }

  async function createLocation() {
    setBusy('location');
    setNotice(null);
    try {
      onChange(await systemApi.createEbayLocation(location));
      setShowLocationForm(false);
      setLocation({ name: 'Lager', street: '', postalCode: '', city: '' });
      setNotice({ tone: 'info', text: 'Der Standort ist bei eBay angelegt und ausgewählt.' });
    } catch (caught) {
      setNotice({ tone: 'danger', text: messageOf(caught) });
    } finally {
      setBusy(null);
    }
  }

  const locationValid =
    location.name.trim().length > 0 &&
    location.street.trim().length > 0 &&
    /^\d{5}$/.test(location.postalCode.trim()) &&
    location.city.trim().length > 0;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-title text-ink">Auf eBay einstellen</h2>
        {setup && (
          <span
            className={`shrink-0 inline-flex items-center h-6 px-2 rounded-full text-micro normal-case tracking-normal ${
              setup.publishReady ? 'bg-accent-soft text-accent' : 'bg-warning-soft text-warning'
            }`}
          >
            {setup.publishReady ? 'Bereit' : 'Offen'}
          </span>
        )}
      </div>

      {steps.length > 0 && (
        <ol className="space-y-2" aria-label="eBay-Einrichtung">
          {steps.map((step, index) => (
            <li key={step.id} className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-micro ${
                  step.state === 'done'
                    ? 'bg-accent text-accent-ink'
                    : step.state === 'current'
                      ? 'bg-warning-soft text-warning'
                      : 'bg-surface-hover text-ink-faint'
                }`}
              >
                {step.state === 'done' ? <Icon name="check" size={13} /> : index + 1}
              </span>
              <span className={step.state === 'todo' ? 'text-body text-ink-faint' : 'text-body text-ink'}>{step.label}</span>
              <span className="ml-auto text-micro text-ink-faint">
                {step.state === 'done' ? 'Fertig' : step.state === 'current' ? 'Jetzt' : ''}
              </span>
            </li>
          ))}
        </ol>
      )}

      {notice && <Notice tone={notice.tone === 'info' ? 'info' : 'danger'}>{notice.text}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !setup && <p className="text-body text-ink-muted">eBay-Status wird geladen…</p>}

      {setup && (
        <>
          <div className="space-y-2">
            <p className="text-body text-ink-muted">
              In Coolify bleiben drei Werte. Konto, Richtlinien und Standort stellst du hier ein.
            </p>
            <ul className="space-y-1 text-label font-normal text-ink-muted">
              <li>
                <code>EBAY_CLIENT_ID</code> — {setup.clientIdReady ? 'gesetzt' : 'fehlt, Production App ID'}
              </li>
              <li>
                <code>EBAY_CLIENT_SECRET</code> — {setup.clientSecretReady ? 'gesetzt' : 'fehlt, Cert ID desselben Keysets'}
              </li>
              <li>
                <code>EBAY_RU_NAME</code> — {setup.ruNameReady ? 'gesetzt' : 'fehlt, RuName aus der Entwicklerkonsole'}
              </li>
            </ul>
            <p className="text-label font-normal text-ink-faint">
              Die angenommene Weiterleitungsadresse des RuName muss genau{' '}
              <code className="text-ink-muted">{setup.callbackUrl}</code> sein. Erlaubte Scopes: sell.inventory, sell.account,
              commerce.identity.readonly.
            </p>
            {(!setup.clientIdReady || !setup.clientSecretReady) && (
              <a href={KEYS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-label text-accent">
                eBay-Schlüssel öffnen
                <Icon name="external" size={13} />
              </a>
            )}
            {!setup.encryptionReady && (
              <Notice tone="warning">
                JWT_SECRET oder EBAY_TOKEN_SECRET fehlt. Ohne diesen Schlüssel speichert die App das eBay-Zugangstoken nicht.
                Coolify setzt JWT_SECRET normalerweise selbst.
              </Notice>
            )}
            {setup.environment === 'sandbox' && (
              <Notice tone="warning">Sandbox ist an. Für echte Anzeigen auf ebay.de EBAY_ENVIRONMENT leer lassen.</Notice>
            )}
          </div>

          <div className="space-y-2">
            {setup.connected ? (
              <>
                <p className="text-body text-ink">
                  {setup.username ? `Verbunden als ${setup.username}.` : 'eBay-Konto verbunden.'}{' '}
                  {setup.connectionSource === 'database'
                    ? 'Gespeichert in der App.'
                    : 'Aus Coolify (EBAY_REFRESH_TOKEN). Eine Verbindung hier ersetzt diesen Wert.'}
                </p>
                {setup.refreshExpiresAt && (
                  <p className="text-label font-normal text-ink-muted">
                    Zugang gespeichert bis {formatGermanDate(setup.refreshExpiresAt)}.
                  </p>
                )}
                {setup.health === 'ok' && <p className="text-label font-normal text-ink-muted">Zugang in Ordnung.</p>}
                {setup.health === 'error' && setup.healthMessage && <Notice tone="danger">{setup.healthMessage}</Notice>}
                {setup.tokenUnreadable && (
                  <Notice tone="warning">Das gespeicherte Token lässt sich nicht lesen. Verbinde das Konto neu.</Notice>
                )}
                {setup.refreshExpiresSoon && !setup.refreshExpired && (
                  <Notice tone="warning">Der eBay-Zugang läuft bald ab. Danach das Konto neu verbinden.</Notice>
                )}
                {setup.refreshExpired && (
                  <Notice tone="danger">Der gespeicherte eBay-Zugang ist abgelaufen. Verbinde das Konto neu.</Notice>
                )}
              </>
            ) : (
              <p className="text-body text-ink-muted">
                „Mit eBay verbinden“ öffnet eBay. Melde dich mit dem Verkäuferkonto an und erlaube den Zugriff. Danach kommst du
                hierher zurück.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon="key" loading={busy === 'connect'} disabled={!setup.oauthReady} onClick={connect}>
                {setup.connectionSource === 'database' ? 'Neu verbinden' : 'Mit eBay verbinden'}
              </Button>
              {setup.connectionSource === 'database' && (
                <Button size="sm" variant="secondary" loading={busy === 'disconnect'} onClick={disconnect}>
                  Verbindung trennen
                </Button>
              )}
              {setup.connected && (
                <Button size="sm" variant="ghost" icon="refresh" loading={busy === 'reload'} onClick={reload}>
                  Neu laden
                </Button>
              )}
            </div>
          </div>

          {setup.catalogError && <Notice tone="warning">{setup.catalogError}</Notice>}
          {setup.policiesOptedIn === false && (
            <Notice tone="warning">
              <span>
                {setup.policiesHint}
                <a className="block mt-1 underline font-semibold" href={POLICIES_URL} target="_blank" rel="noopener noreferrer">
                  Geschäftsrichtlinien bei eBay öffnen
                </a>
              </span>
            </Notice>
          )}

          {showPolicies && selection && (
            <div className="space-y-3">
              <PolicySelect
                label="Versand"
                value={selection.fulfillmentPolicyId}
                options={setup.fulfillmentPolicies}
                source={setup.selectionSource.fulfillmentPolicyId}
                emptyHint={
                  setup.policiesOptedIn
                    ? 'Es gibt noch keine Versandrichtlinie. Lege sie im Verkäufer-Cockpit an und tippe auf Neu laden.'
                    : ''
                }
                onChange={(fulfillmentPolicyId) => setDraft({ setup, selection: { ...selection, fulfillmentPolicyId } })}
              />
              <PolicySelect
                label="Zahlung"
                value={selection.paymentPolicyId}
                options={setup.paymentPolicies}
                source={setup.selectionSource.paymentPolicyId}
                emptyHint={
                  setup.policiesOptedIn
                    ? 'Es gibt noch keine Zahlungsrichtlinie. Lege sie im Verkäufer-Cockpit an und tippe auf Neu laden.'
                    : ''
                }
                onChange={(paymentPolicyId) => setDraft({ setup, selection: { ...selection, paymentPolicyId } })}
              />
              <PolicySelect
                label="Rückgabe"
                value={selection.returnPolicyId}
                options={setup.returnPolicies}
                source={setup.selectionSource.returnPolicyId}
                emptyHint={
                  setup.policiesOptedIn
                    ? 'Es gibt noch keine Rückgaberichtlinie. Auch „keine Rückgabe“ ist eine Richtlinie. Danach Neu laden.'
                    : ''
                }
                onChange={(returnPolicyId) => setDraft({ setup, selection: { ...selection, returnPolicyId } })}
              />
              <PolicySelect
                label="Abholung"
                hint="Nur für Artikel, die nur abgeholt werden. Eine Versandrichtlinie mit Abholung vor Ort."
                value={selection.pickupFulfillmentPolicyId}
                options={setup.fulfillmentPolicies}
                source={setup.selectionSource.pickupFulfillmentPolicyId}
                allowEmpty
                emptyHint=""
                onChange={(pickupFulfillmentPolicyId) =>
                  setDraft({ setup, selection: { ...selection, pickupFulfillmentPolicyId } })
                }
              />
              <LocationSelect
                value={selection.merchantLocationKey}
                options={setup.locations}
                source={setup.selectionSource.merchantLocationKey}
                onChange={(merchantLocationKey) => setDraft({ setup, selection: { ...selection, merchantLocationKey } })}
              />
              {setup.autoSelected.length > 0 && (
                <p className="text-label font-normal text-ink-faint">
                  Wo eBay nur eine Möglichkeit geliefert hat, ist sie gespeichert.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" loading={busy === 'save'} onClick={save}>
                  Auswahl speichern
                </Button>
                <a href={POLICIES_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-label text-accent">
                  Geschäftsrichtlinien öffnen
                  <Icon name="external" size={13} />
                </a>
              </div>
            </div>
          )}

          {setup.connected && setup.health !== 'error' && !setup.catalogError && (setup.locations.length === 0 || showLocationForm) && (
            <div className="space-y-3">
              <p className="text-body text-ink-muted">
                {setup.locations.length === 0
                  ? 'Noch kein Lagerstandort. Lege einen an, zum Beispiel deine Heimatadresse. eBay braucht ihn für jedes Angebot. Bei Abholung ist das der Abholort.'
                  : 'Neuer Lagerstandort. Land ist Deutschland.'}
              </p>
              <Field label="Name">
                <input className={inputClass} value={location.name} maxLength={40} onChange={(event) => setLocation({ ...location, name: event.target.value })} />
              </Field>
              <Field label="Straße">
                <input className={inputClass} value={location.street} maxLength={80} onChange={(event) => setLocation({ ...location, street: event.target.value })} />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="PLZ">
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={location.postalCode}
                    maxLength={5}
                    onChange={(event) => setLocation({ ...location, postalCode: event.target.value })}
                  />
                </Field>
                <div className="col-span-2">
                  <Field label="Ort">
                    <input className={inputClass} value={location.city} maxLength={40} onChange={(event) => setLocation({ ...location, city: event.target.value })} />
                  </Field>
                </div>
              </div>
              <Button size="sm" loading={busy === 'location'} disabled={!locationValid} onClick={createLocation}>
                Standort anlegen
              </Button>
            </div>
          )}

          {setup.connected && setup.health !== 'error' && !setup.catalogError && setup.locations.length > 0 && !showLocationForm && (
            <Button size="sm" variant="ghost" onClick={() => setShowLocationForm(true)}>
              Weiteren Standort anlegen
            </Button>
          )}

          {setup.publishReady ? (
            <p className="text-body text-ink-muted">Bereit zum Einstellen. Anzeigen können von hier aus auf eBay.de online gehen.</p>
          ) : (
            setup.publishMissing.length > 0 &&
            setup.connected && (
              <ul className="space-y-1">
                {setup.publishMissing.map((line) => (
                  <li key={line} className="text-label font-normal text-ink-muted">
                    {line}
                  </li>
                ))}
              </ul>
            )
          )}
        </>
      )}
    </Card>
  );
}

function PolicySelect({
  label,
  hint,
  value,
  options,
  source,
  emptyHint,
  allowEmpty,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string | null;
  options: EbayPolicyOption[];
  source: EbayValueSource;
  emptyHint: string;
  allowEmpty?: boolean;
  onChange: (value: string | null) => void;
}) {
  const real = options.filter((option) => !option.stale);
  if (real.length === 0 && !allowEmpty) {
    return emptyHint ? <p className="text-label font-normal text-ink-muted">{emptyHint}</p> : null;
  }
  return (
    <Field label={label} hint={hint ?? sourceHint(source, real.length === 1)}>
      <select className={inputClass} value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">{allowEmpty ? 'Keine' : 'Bitte wählen'}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
            {option.localPickup ? ' · Abholung' : ''}
          </option>
        ))}
      </select>
    </Field>
  );
}

function LocationSelect({
  value,
  options,
  source,
  onChange,
}: {
  value: string | null;
  options: EbayLocationOption[];
  source: EbayValueSource;
  onChange: (value: string | null) => void;
}) {
  const real = options.filter((option) => !option.stale);
  if (real.length === 0) return null;
  return (
    <Field label="Standort" hint={sourceHint(source, real.length === 1)}>
      <select className={inputClass} value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">Bitte wählen</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.name}
            {option.postalCode || option.city ? ` · ${[option.postalCode, option.city].filter(Boolean).join(' ')}` : ''}
          </option>
        ))}
      </select>
    </Field>
  );
}

function sourceHint(source: EbayValueSource, onlyOne: boolean): string | undefined {
  const origin = sourceLabel(source);
  if (origin && onlyOne) return `${origin}. Nur diese eine Möglichkeit.`;
  if (origin) return origin;
  if (onlyOne) return 'Nur diese eine Möglichkeit.';
  return undefined;
}

function messageOf(caught: unknown): string {
  if (caught instanceof ApiRequestError) return caught.body.message;
  return 'Das hat gerade nicht geklappt.';
}
