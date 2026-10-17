import { useEffect, useState, type ReactNode } from 'react';
import { ApiRequestError } from '../api/client';
import { itemsApi } from '../api/items';
import { Button, Card, Notice, inputClass } from '../ui';
import { LogoMark } from './AppShell';

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
  const storedToken = localStorage.getItem(STORAGE_KEY);
  const [token, setToken] = useState<string | null>(storedToken);
  const [validating, setValidating] = useState(!!storedToken);
  const [checking, setChecking] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setValidating(true);
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
        if (!cancelled) setValidating(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  if (token && validating) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-ink-muted">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-body">Verbindung wird geprüft…</p>
        </div>
      </div>
    );
  }

  if (token) return <>{children}</>;

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <LogoMark className="w-12 h-12 text-accent" />
          <h1 className="text-display text-ink">Resale OS</h1>
        </div>
        <Card className="p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-title text-ink">Zugriffstoken</h2>
            <p className="text-body text-ink-muted">
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
            aria-label="Access Token"
            className={inputClass}
            autoFocus
          />
          {error && <Notice tone="danger">{error}</Notice>}
          <Button block size="lg" disabled={checking || !input.trim()} onClick={submit}>
            {checking ? 'Prüft…' : 'Bestätigen'}
          </Button>
        </Card>
      </div>
    </div>
  );
}

export function clearAccessToken(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}
