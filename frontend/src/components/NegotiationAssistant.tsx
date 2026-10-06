import { useState } from 'react';
import {
  negotiationApi,
  type NegotiationPlatform,
  type NegotiationReply,
  type NegotiationSuggestion,
} from '../api/negotiation';
import { ApiRequestError } from '../api/client';
import { formatEur } from '../margin/sale-closeout';

const PLATFORMS: { id: NegotiationPlatform; label: string }[] = [
  { id: 'KLEINANZEIGEN', label: 'Kleinanzeigen' },
  { id: 'VINTED', label: 'Vinted' },
  { id: 'EBAY', label: 'eBay' },
];

/**
 * Verhandlung an der Schmerzgrenze (Feature-Plan 3.7).
 * Die Nachricht wird eingefügt. Die Antworten werden kopiert.
 * Es wird nichts gesendet.
 */
export function NegotiationAssistant({
  itemId,
  title,
  targetPrice,
  minPrice,
}: {
  itemId: string;
  title: string | null;
  targetPrice: number;
  minPrice: number;
}) {
  const [platform, setPlatform] = useState<NegotiationPlatform>('KLEINANZEIGEN');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<NegotiationSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const platformLabel = PLATFORMS.find((entry) => entry.id === platform)?.label ?? 'dem Portal';

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await negotiationApi.suggest(itemId, { message, platform }));
    } catch (e) {
      setResult(null);
      setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-extrabold text-ink tracking-tight">Verhandlung</h1>
        <p className="text-sm text-ink-muted">{title?.trim() || 'Artikel'}</p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <PriceFigure label="Zielpreis" value={targetPrice} />
        <PriceFigure label="Schmerzgrenze" value={minPrice} />
      </div>
      <p className="text-xs text-ink-muted">
        Preise aus der Preisrecherche dieses Artikels. Die Nachricht bleibt hier, nichts wird
        gesendet.
      </p>

      <div className="space-y-2">
        <span className="block text-[10px] font-bold text-ink-faint uppercase">Einfügen bei</span>
        <div className="flex gap-2">
          {PLATFORMS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setPlatform(entry.id)}
              className={`flex-1 px-2 py-2 rounded-xl text-xs font-bold border transition-colors ${
                platform === entry.id
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-surface text-ink-muted hover:bg-surface-hover'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block space-y-1">
        <span className="block text-[10px] font-bold text-ink-faint uppercase">
          Käufernachricht einfügen
        </span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={5}
          placeholder="Nachricht aus Kleinanzeigen, Vinted oder eBay hier einfügen"
          className="w-full bg-surface p-3 rounded-xl border border-line text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft resize-none"
        />
      </label>

      {error && <p className="text-xs text-danger">{error}</p>}

      <button
        type="button"
        disabled={busy || message.trim().length === 0}
        onClick={() => void submit()}
        className="w-full p-3 rounded-xl font-bold bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
      >
        {busy ? 'Liest das Gebot…' : 'Antworten vorschlagen'}
      </button>

      {result && (
        <SuggestionResult
          key={`${result.platform}-${result.offer ?? 'none'}-${result.assessment}`}
          result={result}
          platformLabel={PLATFORMS.find((entry) => entry.id === result.platform)?.label ?? platformLabel}
        />
      )}
    </div>
  );
}

function PriceFigure({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface border border-line rounded-xl p-3">
      <span className="block text-[10px] font-bold text-ink-faint uppercase">{label}</span>
      <span className="font-bold text-ink">{formatEur(value)}</span>
    </div>
  );
}

function SuggestionResult({
  result,
  platformLabel,
}: {
  result: NegotiationSuggestion;
  platformLabel: string;
}) {
  return (
    <div className="space-y-3">
      <div className="bg-surface border border-line rounded-xl p-3 space-y-2">
        <div className="flex justify-between gap-3">
          <div>
            <span className="block text-[10px] font-bold text-ink-faint uppercase">Gebot</span>
            <span className="font-bold text-ink">
              {result.offer == null ? 'kein Betrag' : formatEur(result.offer)}
            </span>
          </div>
          <div className="text-right">
            <span className="block text-[10px] font-bold text-ink-faint uppercase">Schmerzgrenze</span>
            <span className="font-medium text-ink-muted">{formatEur(result.minPrice)}</span>
          </div>
        </div>
        <p className="text-sm text-ink">{result.assessment}</p>
      </div>

      <h2 className="text-xs font-bold text-ink-muted uppercase">Drei Antworten</h2>
      {result.replies.map((reply) => (
        <ReplyCard key={reply.id} reply={reply} platformLabel={platformLabel} />
      ))}
    </div>
  );
}

function ReplyCard({ reply, platformLabel }: { reply: NegotiationReply; platformLabel: string }) {
  const [text, setText] = useState(reply.text);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    window.setTimeout(() => setCopyState('idle'), 1800);
  };

  return (
    <div
      className={`bg-surface border rounded-xl p-3 space-y-2 ${
        reply.recommended ? 'border-accent' : 'border-line'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">{reply.label}</h3>
        {reply.recommended && (
          <span className="text-[10px] font-bold uppercase text-accent">Vorschlag</span>
        )}
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        className="w-full bg-bg p-3 rounded-lg border border-line text-sm text-ink outline-none focus:border-accent resize-none"
      />
      <button
        type="button"
        onClick={() => void copy()}
        className="w-full p-3 rounded-xl font-bold bg-accent text-accent-ink hover:bg-accent-hover transition-colors"
      >
        {copyState === 'copied'
          ? 'Antwort kopiert'
          : copyState === 'error'
            ? 'Kopieren nicht möglich — Text markieren'
            : 'Antwort kopieren'}
      </button>
      <p className="text-[10px] text-ink-faint text-center">
        Zum Einfügen bei {platformLabel}. Es wird nichts gesendet.
      </p>
    </div>
  );
}
