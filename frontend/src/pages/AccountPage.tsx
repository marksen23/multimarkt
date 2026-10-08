import { useEffect, useState } from 'react';
import { accountApi } from '../api/account';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import { clearAccessToken } from '../components/TokenGate';
import { useTheme } from '../hooks/useTheme';
import type { DeletionAuditLog, ItemListEntry, ItemLifecycleState } from '../api/types';

const AKTIV_STATES: ItemLifecycleState[] = ['LISTED', 'SALE_CONFLICT', 'BUNDLED'];
const SOLD_STATES: ItemLifecycleState[] = ['SOLD'];
const PENDING_STATES: ItemLifecycleState[] = ['READY', 'REVIEW_REQUIRED'];

interface AccountStats {
  total: number;
  pending: number;
  aktiv: number;
  sold: number;
  erloes: number;
  realizedErloes: number;
}

function computeStats(entries: ItemListEntry[]): AccountStats {
  return {
    total: entries.length,
    pending: entries.filter((e) => (PENDING_STATES as ItemLifecycleState[]).includes(e.item.status)).length,
    aktiv: entries.filter((e) => (AKTIV_STATES as ItemLifecycleState[]).includes(e.item.status)).length,
    sold: entries.filter((e) => (SOLD_STATES as ItemLifecycleState[]).includes(e.item.status)).length,
    erloes: entries
      .filter((e) => e.item.status === 'LISTED' && e.listings.length > 0)
      .reduce((sum, e) => sum + e.listings[0].sellingPrice, 0),
    realizedErloes: entries
      .filter((e) => e.item.status === 'SOLD' && e.listings.length > 0)
      .reduce((sum, e) => sum + e.listings[0].sellingPrice, 0),
  };
}

/** Doc 04 §16 / Doc 01 §15 — Hard-Delete-Lifecycle (T08-1). */
export function AccountPage() {
  const [confirming, setConfirming] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeletionAuditLog | null>(null);
  const [stats, setStats] = useState<AccountStats | null>(null);

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
    itemsApi.list().then((entries) => setStats(computeStats(entries))).catch(() => {});
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

  return (
    <div className="max-w-md mx-auto p-6 space-y-5">
      <h1 className="text-xl font-extrabold text-ink tracking-tight">Konto</h1>

      {/* Stats */}
      {!stats && (
        <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
          <div className="h-3 w-24 rounded-full bg-surface-hover animate-pulse" />
          <div className="grid grid-cols-2 gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-surface-hover rounded-xl p-3 space-y-1 animate-pulse">
                <div className="h-2.5 w-16 rounded-full bg-line" />
                <div className="h-5 w-8 rounded-full bg-line" />
              </div>
            ))}
          </div>
        </div>
      )}
      {stats && (
        <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-ink-muted uppercase tracking-wide">Übersicht</p>
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Artikel gesamt" value={stats.total} />
            <MiniStat label="Handlung nötig" value={stats.pending} highlight={stats.pending > 0} />
            <MiniStat label="Aktiv" value={stats.aktiv} />
            <MiniStat label="Verkauft" value={stats.sold} />
          </div>
          {(stats.erloes > 0 || stats.realizedErloes > 0) && (
            <div className="pt-2 border-t border-line space-y-1">
              {stats.realizedErloes > 0 && (
                <p className="text-xs text-ink-muted">
                  Tatsächlich erlöst:{' '}
                  <span className="font-bold text-accent">{stats.realizedErloes.toFixed(2)} €</span>
                </p>
              )}
              {stats.erloes > 0 && (
                <p className="text-xs text-ink-muted">
                  Erwartet (aktive Listings):{' '}
                  <span className="font-bold text-ink">{stats.erloes.toFixed(2)} €</span>
                </p>
              )}
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

function MiniStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="bg-surface-hover rounded-xl p-3">
      <p className={`text-lg font-extrabold ${highlight ? 'text-accent' : 'text-ink'}`}>{value}</p>
      <p className="text-[11px] text-ink-faint mt-0.5">{label}</p>
    </div>
  );
}
