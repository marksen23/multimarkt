import { useState } from 'react';
import { copyText } from '../lib/clipboard';
import {
  negotiationApi,
  type NegotiationPlatform,
  type NegotiationReply,
  type NegotiationSuggestion,
} from '../api/negotiation';
import { ApiRequestError } from '../api/client';
import { formatEur } from '../margin/sale-closeout';
import { Button, Card, Notice, PageHeader, SectionLabel, inputClass } from '../ui';

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
      <PageHeader title="Verhandlung" subtitle={title?.trim() || 'Artikel'} />

      <div className="grid grid-cols-2 gap-2">
        <PriceFigure label="Zielpreis" value={targetPrice} />
        <PriceFigure label="Schmerzgrenze" value={minPrice} />
      </div>
      <p className="text-label font-normal text-ink-muted">
        Preise aus der Preisrecherche dieses Artikels. Die Nachricht bleibt hier, nichts wird
        gesendet.
      </p>

      <div className="space-y-2">
        <span className="block text-micro uppercase text-ink-faint">Einfügen bei</span>
        <div className="flex gap-2">
          {PLATFORMS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setPlatform(entry.id)}
              className={`flex-1 h-9 px-2 rounded-control text-label border transition-colors ${
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
        <span className="block text-micro uppercase text-ink-faint">
          Käufernachricht einfügen
        </span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={5}
          placeholder="Nachricht aus Kleinanzeigen, Vinted oder eBay hier einfügen"
          className={`${inputClass} resize-none`}
        />
      </label>

      {error && <Notice tone="danger">{error}</Notice>}

      <Button
        block
        size="md"
        icon="sparkle"
        loading={busy}
        disabled={busy || message.trim().length === 0}
        onClick={() => void submit()}
      >
        Antworten vorschlagen
      </Button>

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
    <Card className="p-3">
      <span className="block text-micro uppercase text-ink-faint">{label}</span>
      <span className="text-title text-ink tabular-nums">{formatEur(value)}</span>
    </Card>
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
      <Card className="p-3 space-y-2">
        <div className="flex justify-between gap-3">
          <div>
            <span className="block text-micro uppercase text-ink-faint">Gebot</span>
            <span className="font-bold text-ink tabular-nums">
              {result.offer == null ? 'kein Betrag' : formatEur(result.offer)}
            </span>
          </div>
          <div className="text-right">
            <span className="block text-micro uppercase text-ink-faint">Schmerzgrenze</span>
            <span className="font-medium text-ink-muted tabular-nums">{formatEur(result.minPrice)}</span>
          </div>
        </div>
        <p className="text-body text-ink">{result.assessment}</p>
      </Card>

      <SectionLabel>Drei Antworten</SectionLabel>
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
      await copyText(text);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    window.setTimeout(() => setCopyState('idle'), 1800);
  };

  return (
    <div
      className={`bg-surface border rounded-card shadow-card p-3 space-y-2 ${
        reply.recommended ? 'border-accent' : 'border-line'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-body font-bold text-ink">{reply.label}</h3>
        {reply.recommended && (
          <span className="text-micro uppercase text-accent">Vorschlag</span>
        )}
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        className={`${inputClass} resize-none`}
      />
      <Button
        block
        size="md"
        icon={copyState === 'copied' ? 'check' : 'copy'}
        onClick={() => void copy()}
      >
        {copyState === 'copied'
          ? 'Antwort kopiert'
          : copyState === 'error'
            ? 'Kopieren nicht möglich — Text markieren'
            : 'Antwort kopieren'}
      </Button>
      <p className="text-label font-normal text-ink-faint text-center">
        Zum Einfügen bei {platformLabel}. Es wird nichts gesendet.
      </p>
    </div>
  );
}
