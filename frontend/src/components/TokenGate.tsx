import { useEffect, useState, type ReactNode } from 'react';
import { ApiRequestError } from '../api/client';
import { itemsApi } from '../api/items';

const STORAGE_KEY = 'resale_os_access_token';

/**
 * Einzelnutzer-App ohne Login-Flow (Doc 04: kein /auth-Endpoint) — der
 * Zugriffstoken ist ein statisches Secret (`APP_ACCESS_TOKEN`, von Render
 * generiert). Bisher gab es dafür keine UI — `client.ts` liest den Token
 * nur aus `localStorage`, ohne dass ihn je jemand dort hineinschreiben
 * konnte, außer manuell über die Browser-Devtools. Für eine echte, im Web
 * erreichbare Deployment ist das ein harter Dead-End (jeder API-Call
 * scheitert mit "Missing Authorization..."), deshalb dieses Gate: fragt
 * den Token einmalig ab, prüft ihn gegen eine echte Route, speichert ihn
 * erst bei Erfolg.
 */
export function TokenGate({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [checking, setChecking] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    // Ein gespeicherter, aber ungültig gewordener Token (z.B. nach einem
    // Redeploy mit neu generiertem Secret) soll nicht in einer Dauerschleife
    // aus kryptischen Fehlermeldungen enden — einmal beim Laden prüfen.
    let cancelled = false;
    setChecking(true);
    itemsApi
      .list()
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiRequestError && e.status === 401) {
          localStorage.removeItem(STORAGE_KEY);
          setToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async () => {
    if (!input.trim()) return;
    setChecking(true);
    setError(null);
    localStorage.setItem(STORAGE_KEY, input.trim());
    try {
      await itemsApi.list();
      setToken(input.trim());
    } catch (e) {
      localStorage.removeItem(STORAGE_KEY);
      setError(
        e instanceof ApiRequestError && e.status === 401
          ? 'Token ungültig — im Render-Dashboard unter resale-os-backend → Environment → APP_ACCESS_TOKEN nachsehen.'
          : 'Verbindung zum Server fehlgeschlagen.',
      );
    } finally {
      setChecking(false);
    }
  };

  if (token) return <>{children}</>;

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-sm border border-line p-6 space-y-4">
        <div className="space-y-1">
          <div className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center text-accent text-lg mb-1">
            🔒
          </div>
          <h1 className="text-lg font-bold text-ink">Zugriffstoken</h1>
          <p className="text-sm text-ink-muted">
            Einzelnutzer-App ohne Login — trage den Wert von <code>APP_ACCESS_TOKEN</code> ein
            (Render-Dashboard → resale-os-backend → Environment).
          </p>
        </div>
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Access Token"
          className="w-full p-3 border border-line rounded-xl text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition"
          autoFocus
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          type="button"
          disabled={checking || !input.trim()}
          onClick={submit}
          className="w-full p-3 rounded-xl font-bold bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
        >
          {checking ? 'Prüft…' : 'Bestätigen'}
        </button>
      </div>
    </div>
  );
}

export function clearAccessToken(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}
