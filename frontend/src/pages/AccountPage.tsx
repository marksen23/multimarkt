import { useState } from 'react';
import { accountApi } from '../api/account';
import { ApiRequestError } from '../api/client';
import type { DeletionAuditLog } from '../api/types';

/** Doc 04 §16 / Doc 01 §15 — Hard-Delete-Lifecycle (T08-1). */
export function AccountPage() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeletionAuditLog | null>(null);

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
              Medien-Löschung läuft noch nicht automatisch mit: der S3-Adapter existiert (siehe
              S3StorageProvider), aber der Job, der pro gelöschtem Foto tatsächlich
              `storage.delete()` aufruft, ist noch nicht an diesen Lösch-Flow angebunden.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <h1 className="text-xl font-extrabold text-ink tracking-tight">Konto</h1>

      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 space-y-3">
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
