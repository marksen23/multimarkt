import { useEffect, useState } from 'react';
import { accountApi } from '../api/account';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import { clearAccessToken } from '../components/TokenGate';
import { useTheme } from '../hooks/useTheme';
import type { DeletionAuditLog, ItemListEntry } from '../api/types';

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
    return (
      <div className="max-w-md mx-auto p-6">
        <div className="bg-surface border border-line rounded-2xl p-6 space-y-3 text-center">
          <h1 className="text-lg font-bold text-ink">Löschung abgeschlossen</h1>
          <p className="text-sm text-ink-muted">
            Alle personenbezogenen Daten wurden kaskadierend aus der Datenbank entfernt.
          </p>
          <div className="text-left text-xs bg-surface-hover rounded-xl p-3 space-y-1 font-mono text-ink-muted">
            <p>db_records_deleted: {String(result.dbRecordsDeleted)}</p>
            <p>media_hard_deleted: {String(result.mediaHardDeleted)}</p>
            <p>hash: {result.anonymizedUserHash.slice(0, 16)}…</p>
          </div>
          {!result.mediaHardDeleted && (
            <p className="text-[11px] text-orange-600 dark:text-orange-400">
              Hinweis: Hochgeladene Fotos werden separat im Medienspeicher verwaltet und müssen
              ggf. manuell gelöscht werden.
            </p>
          )}
        </div>
      </div>
    );
  }

  const total = entries?.length ?? 0;
  const active =
    entries?.filter((e) =>
      ['LISTED', 'SALE_CONFLICT', 'BUNDLED'].includes(e.item.status),
    ).length ?? 0;
  const sold = entries?.filter((e) => e.item.status === 'SOLD').length ?? 0;
  const revenue =
    entries
      ?.filter((e) => e.item.status === 'SOLD')
      .reduce((sum, e) => sum + (e.listings[0]?.sellingPrice ?? 0), 0) ?? 0;
  const lagerwert =
    entries
      ?.filter((e) => e.item.status === 'READY' || e.item.status === 'LISTED')
      .reduce((sum, e) => sum + (e.listings[0]?.sellingPrice ?? 0), 0) ?? 0;

  return (
    <div className="max-w-md mx-auto p-6 space-y-5">
      <h1 className="text-xl font-extrabold text-ink tracking-tight">Konto</h1>

      {entries === null ? (
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-surface border border-line rounded-xl p-4 h-16 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Artikel gesamt" value={String(total)} />
            <StatCard label="Aktiv" value={String(active)} highlight={active > 0} />
            <StatCard label="Verkauft" value={String(sold)} />
            <StatCard
              label="Erlös"
              value={
                revenue > 0
                  ? revenue.toLocaleString('de-DE', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    }) + ' €'
                  : '—'
              }
              highlight={revenue > 0}
            />
          </div>
          {lagerwert > 0 && (
            <div className="bg-surface border border-line rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-bold text-ink-muted uppercase tracking-wide">
                Lagerwert
              </span>
              <span className="text-base font-extrabold tabular-nums text-accent">
                {lagerwert.toLocaleString('de-DE', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}{' '}
                €
              </span>
            </div>
          )}
        </div>
      )}

      {/* Darstellung */}
      <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
        <p className="text-sm font-bold text-ink">Darstellung</p>
        <div className="flex gap-2">
          {(['auto', 'light', 'dark'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setThemePref(t)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                themePref === t
                  ? 'bg-accent text-accent-ink border-accent'
                  : 'bg-surface-hover text-ink-muted border-line hover:border-accent hover:text-accent'
              }`}
            >
              {t === 'auto' ? '⚙ Auto' : t === 'light' ? '☀ Hell' : '☾ Dunkel'}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-ink-faint">
          {themePref === 'auto'
            ? 'Folgt dem Systemdesign.'
            : themePref === 'light'
            ? 'Helles Design erzwungen.'
            : 'Dunkles Design erzwungen.'}
        </p>
      </div>

      {/* Abmelden */}
      <div className="bg-surface border border-line rounded-2xl p-4 space-y-2">
        <p className="text-sm font-bold text-ink">Sitzung</p>
        <p className="text-xs text-ink-faint">
          Personal Resale OS — Einzelnutzer-Modus. Kein Passwort, nur ein Zugriffstoken.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className={`w-full mt-1 p-2.5 rounded-xl border text-sm font-bold transition-colors text-left flex items-center gap-2 ${
            confirmLogout
              ? 'bg-danger-soft border-danger/30 text-danger'
              : 'border-line text-ink-muted hover:bg-surface-hover hover:text-ink'
          }`}
        >
          <span className="text-base">↩</span>
          {confirmLogout ? 'Wirklich abmelden?' : 'Abmelden (Token entfernen)'}
        </button>
      </div>

      {/* Danger zone */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 space-y-3">
        <h2 className="font-bold text-red-700 dark:text-red-400">Account löschen</h2>
        <p className="text-xs text-red-700/90 dark:text-red-400/90">
          Löscht unwiderruflich alle Items, Listings, Bundles und Verkaufsdaten (DB-Kaskade). Diese
          Aktion kann nicht rückgängig gemacht werden.
        </p>
        {error && <p className="text-xs text-red-800 dark:text-red-300 font-bold">{error}</p>}
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-sm font-bold text-red-700 dark:text-red-400 underline"
          >
            Löschung starten
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-bold text-red-700 dark:text-red-400">Bist du sicher?</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={requestDeletion}
                className="flex-1 p-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:bg-line disabled:text-ink-faint transition-colors"
              >
                {busy ? 'Löscht…' : 'Ja, endgültig löschen'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="flex-1 p-2 rounded-xl border border-line text-sm font-bold text-ink-muted hover:bg-surface-hover disabled:opacity-50 transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-surface border border-line rounded-xl p-4 space-y-1">
      <p
        className={`text-xl font-extrabold tabular-nums ${highlight ? 'text-accent' : 'text-ink'}`}
      >
        {value}
      </p>
      <p className="text-[10px] font-bold text-ink-muted uppercase tracking-wide">{label}</p>
    </div>
  );
}
