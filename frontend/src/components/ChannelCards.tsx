import { useCallback, useEffect, useRef, useState } from 'react';
import { itemsApi } from '../api/items';
import { listingsApi } from '../api/listings';
import { ApiRequestError } from '../api/client';
import type { ChannelCard, ChannelPackage, ListingChannel, ProjectionLifecycleState, SalesGoal } from '../api/types';
import { StatusBadge } from './StatusBadge';

const PORTALS: {
  id: ListingChannel;
  label: string;
  color: string;
  titleMax: number;
  url: string;
}[] = [
  {
    id: 'KLEINANZEIGEN',
    label: 'Kleinanzeigen',
    color: '#0ca35a',
    titleMax: 65,
    url: 'https://www.kleinanzeigen.de/anzeige-aufgeben',
  },
  {
    id: 'VINTED',
    label: 'Vinted',
    color: '#09b1ba',
    titleMax: 70,
    url: 'https://www.vinted.de/sell',
  },
  {
    id: 'EBAY',
    label: 'eBay',
    color: '#e53238',
    titleMax: 80,
    url: 'https://www.ebay.de/sl/sell',
  },
];

interface CardDraft {
  title: string;
  descriptionText: string;
  suggestedPrice: string;
}

type CopyState = 'idle' | 'copied' | 'error';

function useCopy() {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyText = async (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      timer.current = setTimeout(() => setState('idle'), 1800);
      return true;
    } catch {
      setState('error');
      timer.current = setTimeout(() => setState('idle'), 1800);
      return false;
    }
  };

  return { state, copyText };
}

function draftsFromPackage(pack: ChannelPackage): Record<ListingChannel, CardDraft> {
  const drafts = {} as Record<ListingChannel, CardDraft>;
  for (const card of pack.cards) {
    drafts[card.marketplaceId] = {
      title: card.title,
      descriptionText: card.descriptionText,
      suggestedPrice: card.suggestedPrice === null ? '' : String(card.suggestedPrice),
    };
  }
  return drafts;
}

function copyBlock(draft: CardDraft): string {
  const price = Number(draft.suggestedPrice);
  const parts = [draft.title.trim()];
  if (price > 0) parts.push(`Preis: ${price.toFixed(2)} €`);
  parts.push('', draft.descriptionText.trim());
  return parts.join('\n').trim();
}

function isEditable(status: ProjectionLifecycleState | null): boolean {
  return status === null || status === 'DRAFT' || status === 'COPIED';
}

export function ChannelCards({
  itemId,
  onChanged,
}: {
  itemId: string;
  onChanged?: () => Promise<void> | void;
}) {
  const [salesGoal, setSalesGoal] = useState<SalesGoal>('BALANCED');
  const [pack, setPack] = useState<ChannelPackage | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<ListingChannel, CardDraft>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (next: ChannelPackage) => {
    setPack(next);
    setDrafts(draftsFromPackage(next));
  };

  const load = useCallback(
    async (goal: SalesGoal, fresh: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const next = await itemsApi.channelPackage(itemId, goal, fresh);
        if (fresh && pack) {
          setDrafts((prev) => {
            const merged = { ...prev };
            for (const card of next.cards) {
              const current = pack.cards.find((entry) => entry.marketplaceId === card.marketplaceId);
              if (!current || current.status === null || current.status === 'DRAFT') {
                merged[card.marketplaceId] = {
                  title: card.title,
                  descriptionText: card.descriptionText,
                  suggestedPrice: card.suggestedPrice === null ? '' : String(card.suggestedPrice),
                };
              }
            }
            return merged;
          });
        } else {
          apply(next);
        }
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.body.message : 'Kanal-Karten konnten nicht geladen werden.');
      } finally {
        setLoading(false);
      }
    },
    [itemId, pack],
  );

  useEffect(() => {
    void itemsApi
      .channelPackage(itemId)
      .then(apply)
      .catch((e) =>
        setError(e instanceof ApiRequestError ? e.body.message : 'Kanal-Karten konnten nicht geladen werden.'),
      )
      .finally(() => setLoading(false));
  }, [itemId]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      apply(await itemsApi.channelPackage(itemId));
      await onChanged?.();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.body.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!pack) return;
    const cards = pack.cards.map((card) => {
      const draft = drafts[card.marketplaceId];
      return {
        marketplaceId: card.marketplaceId,
        title: draft?.title.trim() ?? '',
        descriptionText: draft?.descriptionText.trim() ?? '',
        suggestedPrice: Number(draft?.suggestedPrice),
      };
    });
    if (cards.some((card) => !card.title || !card.descriptionText || !(card.suggestedPrice > 0))) {
      setError('Jede Karte braucht Titel, Text und einen Preisvorschlag.');
      return;
    }
    void run(() => itemsApi.saveChannelPackage(itemId, cards));
  };

  const updateDraft = (channel: ListingChannel, patch: Partial<CardDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [channel]: { title: '', descriptionText: '', suggestedPrice: '', ...prev[channel], ...patch },
    }));
  };

  return (
    <div className="px-4 pb-8 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-ink">Kanal-Karten</h1>
        <button
          type="button"
          disabled={loading || busy}
          onClick={() => void load(salesGoal, true)}
          className="text-sm font-bold text-accent hover:text-accent-hover disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {loading ? 'Generiert…' : '↺ Neu'}
        </button>
      </div>

      <select
        value={salesGoal}
        disabled={loading || busy}
        onChange={(e) => {
          const goal = e.target.value as SalesGoal;
          setSalesGoal(goal);
          void load(goal, true);
        }}
        className="w-full text-sm border border-line rounded-xl px-3 py-2 bg-surface text-ink outline-none focus:border-accent"
      >
        <option value="BALANCED">Ausgewogen</option>
        <option value="FAST_SALE">Schnell verkaufen</option>
        <option value="MAX_PROFIT">Maximaler Erlös</option>
        <option value="MINIMAL_EFFORT">Minimaler Aufwand</option>
      </select>

      <p className="text-xs text-ink-faint">
        Kleinanzeigen, Vinted und eBay bleiben Kopierwege. Nichts wird automatisch eingestellt oder gelöscht.
      </p>

      {error && (
        <div className="bg-danger-soft border border-danger/20 rounded-xl p-3 text-xs text-danger">{error}</div>
      )}

      {loading && !pack && (
        <div className="space-y-3">
          <div className="h-40 bg-line animate-pulse rounded-2xl" />
          <div className="h-40 bg-line animate-pulse rounded-2xl" />
        </div>
      )}

      {pack && pack.cards.length === 0 && (
        <p className="text-sm text-ink-muted">Für diesen Artikel gibt es noch keine Kanal-Karten.</p>
      )}

      {pack?.cards.map((card) => {
        const portal = PORTALS.find((entry) => entry.id === card.marketplaceId);
        const draft = drafts[card.marketplaceId] ?? {
          title: card.title,
          descriptionText: card.descriptionText,
          suggestedPrice: card.suggestedPrice === null ? '' : String(card.suggestedPrice),
        };
        if (!portal) return null;
        return (
          <ChannelCardView
            key={card.marketplaceId}
            portal={portal}
            card={card}
            draft={draft}
            busy={busy || loading}
            editable={isEditable(card.status)}
            onChange={(patch) => updateDraft(card.marketplaceId, patch)}
            onMarkCopied={() => {
              if (card.id && card.status === 'DRAFT') {
                void run(() => listingsApi.markCopied(card.id!));
              }
            }}
            onConfirmOnline={() => card.id && run(() => listingsApi.confirmOnline(card.id!))}
            onConfirmPublished={() => card.id && run(() => listingsApi.confirmPublished(card.id!))}
            onCancel={() => card.id && run(() => listingsApi.cancel(card.id!))}
            onConfirmCancel={() => card.id && run(() => listingsApi.confirmCancellation(card.id!))}
            onSold={(price) => card.id && run(() => listingsApi.markSold(card.id!, price))}
          />
        );
      })}

      {pack && pack.cards.length > 0 && pack.cards.some((card) => isEditable(card.status)) && (
        <button
          type="button"
          disabled={busy || loading}
          onClick={save}
          className="w-full p-3 rounded-xl font-bold bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
        >
          {busy ? 'Speichert…' : pack.persisted ? 'Texte speichern' : 'Kanal-Karten anlegen'}
        </button>
      )}
    </div>
  );
}

function ChannelCardView({
  portal,
  card,
  draft,
  busy,
  editable,
  onChange,
  onMarkCopied,
  onConfirmOnline,
  onConfirmPublished,
  onCancel,
  onConfirmCancel,
  onSold,
}: {
  portal: (typeof PORTALS)[number];
  card: ChannelCard;
  draft: CardDraft;
  busy: boolean;
  editable: boolean;
  onChange: (patch: Partial<CardDraft>) => void;
  onMarkCopied: () => void;
  onConfirmOnline: () => void;
  onConfirmPublished: () => void;
  onCancel: () => void;
  onConfirmCancel: () => void;
  onSold: (price: number) => void;
}) {
  const copy = useCopy();
  const [soldPrice, setSoldPrice] = useState(draft.suggestedPrice);
  const [reportingSold, setReportingSold] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const titleOver = draft.title.length > portal.titleMax;
  const status = card.status;

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: portal.color }} />
          <span className="text-sm font-bold text-ink">{portal.label}</span>
          {status === 'CANCELLED' ? (
            <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-zinc-500/10 text-zinc-500">
              Zurückgezogen
            </span>
          ) : (
            status && <StatusBadge status={status} />
          )}
          {!status && <StatusBadge status="DRAFT" />}
        </div>
        <a
          href={portal.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-bold text-ink-muted hover:text-accent transition-colors shrink-0"
        >
          Formular öffnen ↗
        </a>
      </div>

      {status === 'CANCEL_PENDING' && (
        <div className="mx-4 mt-3 bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 text-xs text-orange-700 dark:text-orange-300">
          Bitte zurückziehen. Die Anzeige auf {portal.label} ist noch nicht bestätigt erledigt.
        </div>
      )}

      <div className="p-4 space-y-3">
        <label className="block space-y-1">
          <span className="flex items-center justify-between text-[11px] font-bold text-ink-muted uppercase tracking-wide">
            Titel
            <span className={titleOver ? 'text-danger' : 'text-ink-faint'}>
              {draft.title.length}/{portal.titleMax}
            </span>
          </span>
          <input
            type="text"
            value={draft.title}
            disabled={!editable || busy}
            onChange={(e) => onChange({ title: e.target.value })}
            className={`w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-accent-soft transition bg-transparent text-ink disabled:opacity-70 ${
              titleOver ? 'border-danger' : 'border-line focus:border-accent'
            }`}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wide">Beschreibung</span>
          <textarea
            rows={portal.id === 'VINTED' ? 4 : 8}
            value={draft.descriptionText}
            disabled={!editable || busy}
            onChange={(e) => onChange({ descriptionText: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-line rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition bg-transparent text-ink resize-none disabled:opacity-70"
          />
        </label>

        {card.gapAnalysis.missingTokens.length > 0 && (
          <p className="text-xs text-ink-faint">
            Vergleichsangebote nutzen zusätzlich: {card.gapAnalysis.missingTokens.slice(0, 6).join(', ')}
          </p>
        )}
        {card.vaguePhrases.length > 0 && (
          <div className="text-xs text-ink-faint space-y-0.5">
            {card.vaguePhrases.map((phrase) => (
              <p key={phrase.phrase}>
                „{phrase.phrase}“ ist vage — {phrase.suggestion}
              </p>
            ))}
          </div>
        )}

        <label className="flex items-center justify-between gap-3 text-xs border-t border-line pt-3">
          <span className="font-bold text-ink-muted uppercase tracking-wide">Preisvorschlag</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={draft.suggestedPrice}
              disabled={!editable || busy}
              onChange={(e) => onChange({ suggestedPrice: e.target.value })}
              className="w-24 px-2 py-1 text-sm text-right border border-line rounded-lg outline-none focus:border-accent bg-transparent text-ink disabled:opacity-70"
            />
            <span className="text-ink-muted">€</span>
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !draft.title}
            onClick={() => {
              void copy.copyText(copyBlock(draft));
              onMarkCopied();
            }}
            className="text-[11px] font-bold px-2 py-1 rounded-lg bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
          >
            {copy.state === 'copied' ? '✓ Kopiert' : copy.state === 'error' ? 'Kopieren fehlgeschlagen' : 'Kopieren'}
          </button>
          {status === 'COPIED' && (
            <button
              type="button"
              disabled={busy}
              onClick={onConfirmOnline}
              className="text-[11px] font-bold px-2 py-1 rounded-lg bg-surface-hover text-ink-muted hover:bg-line transition-colors"
            >
              Online bestätigen
            </button>
          )}
          {status === 'PUBLISHING' && (
            <button
              type="button"
              disabled={busy}
              onClick={onConfirmPublished}
              className="text-[11px] font-bold px-2 py-1 rounded-lg bg-surface-hover text-ink-muted hover:bg-line transition-colors"
            >
              Online bestätigen
            </button>
          )}
          {status === 'ONLINE' && !reportingSold && !confirmingCancel && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setSoldPrice(draft.suggestedPrice);
                  setReportingSold(true);
                }}
                className="text-[11px] font-bold px-2 py-1 rounded-lg bg-surface-hover text-ink-muted hover:bg-line transition-colors"
              >
                Als verkauft markieren
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingCancel(true)}
                className="text-[11px] font-bold px-2 py-1 rounded-lg bg-surface-hover text-ink-muted hover:bg-line transition-colors"
              >
                Zurückziehen
              </button>
            </>
          )}
          {status === 'CANCEL_PENDING' && (
            <button
              type="button"
              disabled={busy}
              onClick={onConfirmCancel}
              className="text-[11px] font-bold px-2 py-1 rounded-lg bg-accent text-accent-ink hover:bg-accent-hover transition-colors"
            >
              Zurückgezogen bestätigen
            </button>
          )}
          {(status === 'COPIED' || status === 'DRAFT') && !confirmingCancel && (
            <button
              type="button"
              disabled={busy || !card.id}
              onClick={() => setConfirmingCancel(true)}
              className="text-[11px] font-bold px-2 py-1 rounded-lg bg-surface-hover text-ink-muted hover:bg-line disabled:opacity-50 transition-colors"
            >
              Zurückziehen
            </button>
          )}
        </div>

        {confirmingCancel && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirmingCancel(false);
                onCancel();
              }}
              className="text-[11px] font-bold px-2 py-1 rounded-lg bg-accent text-accent-ink"
            >
              Wirklich zurückziehen?
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingCancel(false)}
              className="text-[11px] font-bold px-2 py-1 rounded-lg bg-surface-hover text-ink-muted"
            >
              Abbrechen
            </button>
          </div>
        )}

        {reportingSold && (
          <div className="flex gap-2 items-center">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={soldPrice}
              onChange={(e) => setSoldPrice(e.target.value)}
              className="flex-1 p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
              placeholder="Verkaufspreis in €"
            />
            <button
              type="button"
              disabled={busy || !(Number(soldPrice) > 0)}
              onClick={() => {
                setReportingSold(false);
                onSold(Number(soldPrice));
              }}
              className="text-[11px] font-bold px-2 py-1 rounded-lg bg-accent text-accent-ink disabled:opacity-50"
            >
              Bestätigen
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setReportingSold(false)}
              className="text-[11px] font-bold px-2 py-1 rounded-lg bg-surface-hover text-ink-muted"
            >
              Abbrechen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
