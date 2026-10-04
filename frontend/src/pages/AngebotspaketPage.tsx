import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { CanonicalListing, Item, ListingChannel, SalesGoal } from '../api/types';

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
    id: 'EBAY',
    label: 'eBay',
    color: '#e53238',
    titleMax: 80,
    url: 'https://www.ebay.de/sl/sell',
  },
  {
    id: 'VINTED',
    label: 'Vinted',
    color: '#09b1ba',
    titleMax: 80,
    url: 'https://www.vinted.de/sell',
  },
];

interface PortalDraft {
  title: string;
  description: string;
}

type CopyState = 'idle' | 'copied' | 'error';

function useCopy() {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = async (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('error');
    }
    timer.current = setTimeout(() => setState('idle'), 1800);
  };

  return { state, copy };
}

export function AngebotspaketPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [salesGoal, setSalesGoal] = useState<SalesGoal>('BALANCED');
  const [activePortal, setActivePortal] = useState<ListingChannel>('KLEINANZEIGEN');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [itemStatus, setItemStatus] = useState<string | null>(null);
  const [listing, setListing] = useState<CanonicalListing | null>(null);
  const [drafts, setDrafts] = useState<Record<ListingChannel, PortalDraft>>({
    KLEINANZEIGEN: { title: '', description: '' },
    EBAY: { title: '', description: '' },
    VINTED: { title: '', description: '' },
  });

  const generate = useCallback(
    async (goal: SalesGoal) => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const [klein, ebay, vinted, descResult, priceResult, itemDetail] = await Promise.all([
          itemsApi.generateTitle(id, 'KLEINANZEIGEN'),
          itemsApi.generateTitle(id, 'EBAY'),
          itemsApi.generateTitle(id, 'VINTED'),
          itemsApi.generateDescription(id, goal),
          itemsApi.priceResearch(id, false, goal),
          itemsApi.get(id),
        ]);
        setItemStatus(itemDetail.item.status);

        setDrafts({
          KLEINANZEIGEN: { title: klein.title, description: descResult.descriptionText },
          EBAY: { title: ebay.title, description: descResult.descriptionText },
          VINTED: { title: vinted.title, description: descResult.descriptionText },
        });

        const rec = priceResult.recommendation;
        if (rec) setPrice(rec.listPrice);
        else {
          const allMedians = priceResult.sources.map((s) => s.median).filter((m): m is number => m !== null);
          if (allMedians.length > 0) setPrice(Math.round(allMedians.reduce((a, b) => a + b, 0) / allMedians.length));
        }
      } catch {
        setError('Generierung fehlgeschlagen. Bitte erneut versuchen.');
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void generate(salesGoal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const updateDraft = (channel: ListingChannel, field: keyof PortalDraft, value: string) => {
    setDrafts((prev) => ({ ...prev, [channel]: { ...prev[channel], [field]: value } }));
  };

  return (
    <div className="max-w-md mx-auto pb-12">
      <div className="p-4 flex items-center justify-between">
        <Link to={`/items/${id}`} className="text-xs text-ink-faint hover:text-ink-muted">
          ← Zurück zum Artikel
        </Link>
        <span className="text-xs font-bold text-ink-muted uppercase tracking-wide">Angebotspaket</span>
      </div>

      {/* Sales-goal selector + Neu generieren */}
      <div className="px-4 pb-4 flex items-center gap-3">
        <select
          value={salesGoal}
          disabled={loading}
          onChange={(e) => {
            const goal = e.target.value as SalesGoal;
            setSalesGoal(goal);
            void generate(goal);
          }}
          className="flex-1 text-sm border border-line rounded-xl px-3 py-2 bg-surface text-ink outline-none focus:border-accent"
        >
          <option value="BALANCED">Ausgewogen</option>
          <option value="FAST_SALE">Schnell verkaufen</option>
          <option value="MAX_PROFIT">Maximaler Erlös</option>
          <option value="MINIMAL_EFFORT">Minimaler Aufwand</option>
        </select>
        <button
          type="button"
          disabled={loading}
          onClick={() => generate(salesGoal)}
          className="text-sm font-bold text-accent hover:text-accent-hover disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {loading ? 'Generiert…' : '↺ Neu'}
        </button>
      </div>

      {error && (
        <div className="mx-4 mb-4 bg-danger-soft border border-danger/20 rounded-xl p-3 text-xs text-danger">
          {error}
        </div>
      )}

      {price !== null && !loading && (
        <div className="mx-4 mb-4 bg-accent-soft border border-accent/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-bold text-ink-muted uppercase tracking-wide">Empfohlener Startpreis</span>
          <span className="text-xl font-bold text-accent">{price.toFixed(2)} €</span>
        </div>
      )}

      {/* Listing anlegen — nur wenn Status READY */}
      {itemStatus === 'READY' && !loading && id && (
        <div className="mx-4 mb-5">
          <PrepareListing
            itemId={id}
            suggestedPrice={price}
            activeDescription={drafts[activePortal].description}
            onSuccess={(result) => {
              setListing(result);
              setItemStatus('LISTED');
            }}
            onNavigate={() => navigate(`/items/${id}`)}
          />
        </div>
      )}

      {listing && !loading && (
        <div className="mx-4 mb-5 bg-accent-soft border border-accent/20 rounded-xl px-4 py-3">
          <p className="text-xs font-bold text-accent mb-1">Listing angelegt ✓</p>
          <p className="text-[11px] text-ink-muted">
            Verkaufspreis: <span className="font-bold text-ink">{listing.sellingPrice.toFixed(2)} €</span>
          </p>
        </div>
      )}

      {/* Portal tabs */}
      <div className="px-4 flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        {PORTALS.map((portal) => (
          <button
            key={portal.id}
            type="button"
            onClick={() => setActivePortal(portal.id)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
              activePortal === portal.id
                ? 'border-transparent text-white'
                : 'bg-surface border-line text-ink-muted hover:border-accent hover:text-accent'
            }`}
            style={activePortal === portal.id ? { backgroundColor: portal.color, borderColor: portal.color } : {}}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: activePortal === portal.id ? 'rgba(255,255,255,0.6)' : portal.color }}
            />
            {portal.label}
          </button>
        ))}
      </div>

      <div className="px-4">
        {PORTALS.filter((p) => p.id === activePortal).map((portal) => (
          <PortalCard
            key={portal.id}
            portal={portal}
            draft={drafts[portal.id]}
            price={price}
            loading={loading}
            onTitleChange={(v) => updateDraft(portal.id, 'title', v)}
            onDescriptionChange={(v) => updateDraft(portal.id, 'description', v)}
          />
        ))}
      </div>
    </div>
  );
}

function PrepareListing({
  itemId,
  suggestedPrice,
  activeDescription,
  onSuccess,
  onNavigate,
}: {
  itemId: string;
  suggestedPrice: number | null;
  activeDescription: string;
  onSuccess: (listing: CanonicalListing) => void;
  onNavigate: () => void;
}) {
  const [priceInput, setPriceInput] = useState(suggestedPrice != null ? suggestedPrice.toFixed(2) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const parsedPrice = parseFloat(priceInput.replace(',', '.'));
  const valid = !isNaN(parsedPrice) && parsedPrice > 0;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setErr(null);
    try {
      const result = await itemsApi.prepareListing(itemId, parsedPrice, activeDescription || undefined);
      onSuccess(result);
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.body.message : 'Fehler beim Anlegen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface border border-accent/30 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-ink">Listing anlegen</p>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent-soft text-accent font-bold border border-accent/30">
          Bereit
        </span>
      </div>
      <p className="text-xs text-ink-faint">
        Verkaufspreis festlegen — Beschreibung wird vom aktiven Portal übernommen.
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            placeholder="Preis in €"
            className="w-full pl-3 pr-8 py-2.5 border border-line rounded-xl text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft bg-transparent text-ink"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint pointer-events-none">€</span>
        </div>
        <button
          type="button"
          disabled={!valid || busy}
          onClick={() => void submit()}
          className="px-4 py-2.5 rounded-xl font-bold text-sm bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors whitespace-nowrap"
        >
          {busy ? 'Anlegen…' : 'Anlegen'}
        </button>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
      <button
        type="button"
        onClick={onNavigate}
        className="text-[11px] text-ink-faint hover:text-ink-muted transition-colors"
      >
        ← Zurück zu Artikel-Details
      </button>
    </div>
  );
}

function PortalCard({
  portal,
  draft,
  price,
  loading,
  onTitleChange,
  onDescriptionChange,
}: {
  portal: (typeof PORTALS)[number];
  draft: PortalDraft;
  price: number | null;
  loading: boolean;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
}) {
  const titleCopy = useCopy();
  const descCopy = useCopy();
  const allCopy = useCopy();

  const titleOver = draft.title.length > portal.titleMax;

  const copyAll = () => {
    const parts = [draft.title];
    if (price !== null) parts.push(`Preis: ${price.toFixed(2)} €`);
    parts.push('', draft.description);
    const text = parts.join('\n').trim();
    void allCopy.copy(text);
  };

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: portal.color }}
          />
          <span className="text-sm font-bold text-ink">{portal.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton state={allCopy.state} onClick={copyAll} label="Alles kopieren" />
          <a
            href={portal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-ink-muted hover:text-accent transition-colors"
          >
            Portal öffnen ↗
          </a>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Title */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wide">Titel</span>
            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] tabular-nums ${titleOver ? 'text-danger font-bold' : 'text-ink-faint'}`}
              >
                {draft.title.length}/{portal.titleMax}
              </span>
              <CopyButton state={titleCopy.state} onClick={() => void titleCopy.copy(draft.title)} />
            </div>
          </div>
          {loading ? (
            <SkeletonLine className="h-9 rounded-lg" />
          ) : (
            <input
              type="text"
              value={draft.title}
              onChange={(e) => onTitleChange(e.target.value)}
              maxLength={portal.titleMax + 20}
              className={`w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-accent-soft transition ${
                titleOver ? 'border-danger focus:border-danger' : 'border-line focus:border-accent'
              } bg-transparent text-ink`}
            />
          )}
        </div>

        {/* Description */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wide">Beschreibung</span>
            <CopyButton
              state={descCopy.state}
              onClick={() => void descCopy.copy(draft.description)}
            />
          </div>
          {loading ? (
            <SkeletonLine className="h-24 rounded-lg" />
          ) : (
            <textarea
              rows={4}
              value={draft.description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-line rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition bg-transparent text-ink resize-none"
            />
          )}
        </div>

        {/* Price hint */}
        {price !== null && !loading && (
          <div className="flex items-center justify-between text-xs text-ink-faint border-t border-line pt-3">
            <span>Startpreis</span>
            <span className="font-bold text-ink">{price.toFixed(2)} €</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CopyButton({
  state,
  onClick,
  label,
}: {
  state: CopyState;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] font-bold transition-colors ${
        state === 'copied'
          ? 'text-accent'
          : state === 'error'
            ? 'text-danger'
            : 'text-ink-faint hover:text-accent'
      }`}
    >
      {state === 'copied' ? '✓ Kopiert' : state === 'error' ? 'Fehler' : label ?? 'Kopieren'}
    </button>
  );
}

function SkeletonLine({ className }: { className?: string }) {
  return <div className={`bg-line animate-pulse ${className ?? ''}`} />;
}
