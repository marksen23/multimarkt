import { useEffect, useState } from 'react';
import { accountApi } from '../api/account';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import { clearAccessToken } from '../components/TokenGate';
import { useTheme } from '../hooks/useTheme';
import type { DeletionAuditLog, ItemListEntry } from '../api/types';
import { Button, Card, Icon, Notice, PageHeader, SectionLabel } from '../ui';
import { formatEuro, realizedPrice } from '../lib/format';

/** Doc 04 §16 / Doc 01 §15 — Hard-Delete-Lifecycle (T08-1). */
export function AccountPage() {
  const [confirming, setConfirming] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeletionAuditLog | null>(null);
  const [entries, setEntries] = useState<ItemListEntry[] | null>(null);

  const handleLogout = () => {
    if (confirmLogout) {
      clearAccessToken();
    } else {
      setConfirmLogout(true);
      setTimeout(() => setConfirmLogout(false), 3000);
    }
  };
  const { pref: themePref, setPref: setThemePref } = useTheme();

  useEffect(() => {
    itemsApi.list().then(setEntries).catch(() => setEntries([]));
  }, []);

  const requestDeletion = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await accountApi.requestDeletion());
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return <DeletionSuccessScreen mediaDeleted={result.mediaHardDeleted} />;
  }

  const total = entries?.length ?? 0;
  const pending =
    entries?.filter((e) =>
      ['NEW', 'ANALYZING', 'REVIEW_REQUIRED', 'READY'].includes(e.item.status),
    ).length ?? 0;
  const active =
    entries?.filter((e) =>
      ['LISTED', 'SALE_CONFLICT', 'BUNDLED'].includes(e.item.status),
    ).length ?? 0;
  const sold = entries?.filter((e) => e.item.status === 'SOLD').length ?? 0;
  const revenue =
    entries
      ?.filter((e) => e.item.status === 'SOLD')
      .reduce((sum, e) => sum + realizedPrice(e), 0) ?? 0;
  const lagerwert =
    entries
      ?.filter((e) => e.item.status === 'READY' || e.item.status === 'LISTED')
      .reduce((sum, e) => sum + (e.listings[0]?.sellingPrice ?? 0), 0) ?? 0;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-5">
      <PageHeader title="Konto" />

      <SectionLabel>Statistik</SectionLabel>

      {entries === null ? (
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4 h-16 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Artikel gesamt" value={String(total)} />
            <StatCard label="Handlung nötig" value={String(pending)} highlight={pending > 0} />
            <StatCard label="Aktiv" value={String(active)} highlight={active > 0} />
            <StatCard label="Verkauft" value={String(sold)} />
            <StatCard
              label="Erlös"
              value={revenue > 0 ? formatEuro(revenue, 0) : '—'}
              highlight={revenue > 0}
              wide
            />
          </div>
          {lagerwert > 0 && (
            <Card className="px-4 py-3 flex items-center justify-between">
              <span className="text-micro uppercase text-ink-muted">Lagerwert</span>
              <span className="text-title tabular-nums text-accent">{formatEuro(lagerwert, 0)}</span>
            </Card>
          )}
        </div>
      )}

      <SectionLabel>Darstellung</SectionLabel>
      <Card className="p-4 space-y-3">
        <div className="flex gap-2">
          {(['auto', 'light', 'dark'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setThemePref(t)}
              className={`flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-control text-label border transition-colors ${
                themePref === t
                  ? 'bg-accent text-accent-ink border-accent'
                  : 'bg-surface-hover text-ink-muted border-line hover:border-accent hover:text-accent'
              }`}
            >
              <Icon name={t === 'auto' ? 'auto' : t === 'light' ? 'sun' : 'moon'} size={15} />
              {t === 'auto' ? 'Auto' : t === 'light' ? 'Hell' : 'Dunkel'}
            </button>
          ))}
        </div>
        <p className="text-label font-normal text-ink-faint">
          {themePref === 'auto'
            ? 'Folgt dem Systemdesign.'
            : themePref === 'light'
            ? 'Helles Design erzwungen.'
            : 'Dunkles Design erzwungen.'}
        </p>
      </Card>

      <SectionLabel>Sitzung</SectionLabel>
      <Card className="p-4 space-y-2">
        <p className="text-label font-normal text-ink-faint">
          Einzelnutzer-Modus. Kein Passwort, nur ein Zugriffstoken.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className={`w-full mt-1 h-11 px-3 rounded-control border text-body font-semibold transition-colors text-left flex items-center gap-2 ${
            confirmLogout
              ? 'bg-danger-soft border-danger/30 text-danger'
              : 'border-line text-ink-muted hover:bg-surface-hover hover:text-ink'
          }`}
        >
          <Icon name="logout" size={17} />
          {confirmLogout ? 'Wirklich abmelden? Nochmal tippen' : 'Abmelden (Token entfernen)'}
        </button>
      </Card>

      {/* Danger zone */}
      <div className="bg-danger-soft/40 border border-danger/20 rounded-card p-4 space-y-3">
        <h2 className="text-title text-danger">Account löschen</h2>
        <p className="text-label font-normal text-danger/90">
          Löscht unwiderruflich alle Items, Listings, Bundles und Verkaufsdaten (DB-Kaskade). Diese
          Aktion kann nicht rückgängig gemacht werden.
        </p>
        {error && <Notice tone="danger">{error}</Notice>}
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-body font-semibold text-danger underline"
          >
            Löschung starten
          </button>
        ) : (
          <div className="space-y-2">
            <Notice tone="danger">Bist du sicher?</Notice>
            <div className="flex gap-2">
              <Button
                variant="danger"
                loading={busy}
                disabled={busy}
                onClick={requestDeletion}
                className="flex-1"
              >
                Ja, endgültig löschen
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="flex-1"
              >
                Abbrechen
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeletionSuccessScreen({ mediaDeleted }: { mediaDeleted: boolean }) {
  const [countdown, setCountdown] = useState(4);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          clearAccessToken();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 flex items-center justify-center min-h-[60vh]">
      <Card className="p-8 space-y-4 text-center w-full">
        <div className="w-12 h-12 rounded-full bg-accent-soft text-accent flex items-center justify-center mx-auto">
          <Icon name="check" size={22} strokeWidth={2.4} />
        </div>
        <div>
          <h1 className="text-title text-ink">Konto gelöscht</h1>
          <p className="text-body text-ink-muted mt-1">
            Alle deine Daten wurden dauerhaft entfernt.
          </p>
        </div>
        {!mediaDeleted && (
          <Notice tone="warning">
            Hochgeladene Fotos werden separat verwaltet und können noch einen Moment verfügbar sein.
          </Notice>
        )}
        <p className="text-label font-normal text-ink-faint">
          Abmeldung in {countdown} Sekunde{countdown !== 1 ? 'n' : ''}…
        </p>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
  wide,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  wide?: boolean;
}) {
  return (
    <Card className={`p-4 space-y-1${wide ? ' col-span-2' : ''}`}>
      <p className={`text-display tabular-nums ${highlight ? 'text-accent' : 'text-ink'}`}>{value}</p>
      <p className="text-micro uppercase text-ink-muted">{label}</p>
    </Card>
  );
}
