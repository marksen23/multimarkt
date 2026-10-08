import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { itemsApi } from '../api/items';
import type {
  DescriptionChannel,
  DescriptionQualityResult,
  IssueSeverity,
  ListingChannel,
  PriceDescriptionAlignment,
  PriceTier,
  SalesGoal,
} from '../api/types';

const PORTALS: {
  id: ListingChannel;
  descChannel: DescriptionChannel;
  label: string;
  color: string;
  titleMax: number;
  url: string;
}[] = [
  {
    id: 'KLEINANZEIGEN',
    descChannel: 'KLEINANZEIGEN',
    label: 'Kleinanzeigen',
    color: '#0ca35a',
    titleMax: 65,
    url: 'https://www.kleinanzeigen.de/anzeige-aufgeben',
  },
  {
    id: 'EBAY',
    descChannel: 'EBAY',
    label: 'eBay',
    color: '#e53238',
    titleMax: 80,
    url: 'https://www.ebay.de/sl/sell',
  },
  {
    id: 'VINTED',
    descChannel: 'VINTED',
    label: 'Vinted',
    color: '#09b1ba',
    titleMax: 80,
    url: 'https://www.vinted.de/sell',
  },
];

interface PortalDraft {
  title: string;
  description: string;
  quality: DescriptionQualityResult | null;
  priceAlignment: PriceDescriptionAlignment | null;
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
  const [salesGoal, setSalesGoal] = useState<SalesGoal>('BALANCED');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<ListingChannel, PortalDraft>>({
    KLEINANZEIGEN: { title: '', description: '', quality: null, priceAlignment: null },
    EBAY: { title: '', description: '', quality: null, priceAlignment: null },
    VINTED: { title: '', description: '', quality: null, priceAlignment: null },
  });

  const generate = useCallback(
    async (goal: SalesGoal) => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const [klein, ebay, vinted, descKlein, descEbay, descVinted, priceResult] = await Promise.all([
          itemsApi.generateTitle(id, 'KLEINANZEIGEN'),
          itemsApi.generateTitle(id, 'EBAY'),
          itemsApi.generateTitle(id, 'VINTED'),
          itemsApi.generateDescription(id, goal, 'KLEINANZEIGEN'),
          itemsApi.generateDescription(id, goal, 'EBAY'),
          itemsApi.generateDescription(id, goal, 'VINTED'),
          itemsApi.priceResearch(id, false, goal),
        ]);

        setDrafts({
          KLEINANZEIGEN: {
            title: klein.title,
            description: descKlein.descriptionText,
            quality: descKlein.quality,
            priceAlignment: descKlein.priceAlignment,
          },
          EBAY: {
            title: ebay.title,
            description: descEbay.descriptionText,
            quality: descEbay.quality,
            priceAlignment: descEbay.priceAlignment,
          },
          VINTED: {
            title: vinted.title,
            description: descVinted.descriptionText,
            quality: descVinted.quality,
            priceAlignment: descVinted.priceAlignment,
          },
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

  const updateDraft = (channel: ListingChannel, field: keyof Pick<PortalDraft, 'title' | 'description'>, value: string) => {
    setDrafts((prev) => ({ ...prev, [channel]: { ...prev[channel], [field]: value } }));
  };

  // Schlechteste Preisbindungs-Warnung für den Header
  const worstAlignment = Object.values(drafts)
    .map((d) => d.priceAlignment)
    .filter(Boolean)
    .sort((a, b) => (a?.alignmentScore ?? 100) - (b?.alignmentScore ?? 100))[0] ?? null;

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

      {/* Preisanzeige + Alignment-Warnung */}
      {price !== null && !loading && (
        <div className="mx-4 mb-3 space-y-2">
          <div className="bg-accent-soft border border-accent/20 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-ink-muted uppercase tracking-wide block">
                Empfohlener Startpreis
              </span>
              {worstAlignment && (
                <span className="text-[11px] text-ink-faint">
                  Preis-Tier: <PriceTierBadge tier={worstAlignment.priceTier} />
                </span>
              )}
            </div>
            <span className="text-xl font-bold text-accent">{price.toFixed(2)} €</span>
          </div>

          {/* Preisbindungs-Warnung wenn Alignment-Score niedrig */}
          {worstAlignment && worstAlignment.alignmentScore < 75 && worstAlignment.issues.length > 0 && (
            <div className="bg-warning-soft border border-warning/20 rounded-xl px-4 py-3 space-y-1">
              <span className="text-xs font-bold text-warning uppercase tracking-wide">
                Preisbindungs-Hinweis
              </span>
              {worstAlignment.issues.map((issue, i) => (
                <p key={i} className="text-xs text-ink-muted">{issue.message}</p>
              ))}
              {worstAlignment.missingValueSignals.length > 0 && (
                <div className="pt-1">
                  <span className="text-[11px] font-bold text-ink-faint uppercase tracking-wide">
                    Wertmerkmale die helfen würden:
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {worstAlignment.missingValueSignals.map((signal) => (
                      <span
                        key={signal}
                        className="text-[10px] bg-surface border border-line rounded-full px-2 py-0.5 text-ink-muted"
                      >
                        {signal}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4 px-4">
        {PORTALS.map((portal) => (
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

function PriceTierBadge({ tier }: { tier: PriceTier }) {
  const config: Record<PriceTier, { label: string; className: string }> = {
    BELOW_MARKET: { label: 'Unter Markt', className: 'text-accent' },
    MARKET: { label: 'Marktüblich', className: 'text-ink-muted' },
    ABOVE_MARKET: { label: 'Über Median', className: 'text-warning' },
    PREMIUM: { label: 'Premium', className: 'text-danger font-bold' },
  };
  const c = config[tier];
  return <span className={c.className}>{c.label}</span>;
}

function QualityBadge({ score }: { score: number }) {
  let label: string;
  let className: string;

  if (score >= 80) {
    label = `${score}`;
    className = 'bg-accent/10 text-accent border-accent/20';
  } else if (score >= 55) {
    label = `${score}`;
    className = 'bg-warning/10 text-warning border-warning/20';
  } else {
    label = `${score}`;
    className = 'bg-danger/10 text-danger border-danger/20';
  }

  return (
    <span
      className={`text-[10px] font-bold border rounded-full px-1.5 py-0.5 tabular-nums ${className}`}
      title="Beschreibungsqualität (0–100)"
    >
      Q {label}
    </span>
  );
}

function SeverityIcon({ severity }: { severity: IssueSeverity }) {
  if (severity === 'ERROR') return <span className="text-danger">●</span>;
  if (severity === 'WARNING') return <span className="text-warning">●</span>;
  return <span className="text-ink-faint">●</span>;
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
  const [showQuality, setShowQuality] = useState(false);

  const titleOver = draft.title.length > portal.titleMax;

  const copyAll = () => {
    const parts = [draft.title];
    if (price !== null) parts.push(`Preis: ${price.toFixed(2)} €`);
    parts.push('', draft.description);
    const text = parts.join('\n').trim();
    void allCopy.copy(text);
  };

  const qualityScore = draft.quality?.score ?? null;
  const hasQualityIssues =
    (draft.quality?.issues.length ?? 0) > 0 || (draft.quality?.attributeCoverage.some((a) => !a.mentioned) ?? false);

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
          {!loading && qualityScore !== null && <QualityBadge score={qualityScore} />}
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
            <div className="flex items-center gap-2">
              {!loading && hasQualityIssues && (
                <button
                  type="button"
                  onClick={() => setShowQuality((v) => !v)}
                  className="text-[10px] font-bold text-ink-faint hover:text-accent transition-colors"
                >
                  {showQuality ? 'Hinweise ▲' : 'Hinweise ▼'}
                </button>
              )}
              <CopyButton
                state={descCopy.state}
                onClick={() => void descCopy.copy(draft.description)}
              />
            </div>
          </div>

          {/* Quality issues panel */}
          {!loading && showQuality && draft.quality && (
            <div className="bg-surface border border-line rounded-lg p-3 space-y-2 text-xs">
              {draft.quality.issues.map((issue, i) => (
                <div key={i} className="flex gap-2">
                  <SeverityIcon severity={issue.severity} />
                  <span className="text-ink-muted leading-snug">{issue.message}</span>
                </div>
              ))}
              {draft.quality.attributeCoverage.length > 0 && (
                <div className="pt-1 border-t border-line">
                  <span className="text-[10px] font-bold text-ink-faint uppercase tracking-wide block mb-1">
                    Attributabdeckung
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {draft.quality.attributeCoverage.map((a) => (
                      <span
                        key={a.key}
                        className={`text-[10px] rounded-full px-2 py-0.5 border ${
                          a.mentioned
                            ? 'bg-accent/10 text-accent border-accent/20'
                            : 'bg-danger/10 text-danger border-danger/20'
                        }`}
                      >
                        {a.key}: {a.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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
