import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { itemsApi } from '../api/items';
import type {
  DescriptionChannel,
  DescriptionQualityResult,
  EstimatedTimeToSale,
  IssueSeverity,
  ListingChannel,
  MarketplaceRecommendation,
  PriceDescriptionAlignment,
  PriceTier,
  SalesGoal,
  SecondhandMarketplace,
} from '../api/types';

// ─── Portal text-generation config ───────────────────────────────────────────

interface PortalTextConfig {
  titleChannel: ListingChannel;
  descChannel: DescriptionChannel;
  titleMax: number;
}

const TEXT_CONFIGS: Partial<Record<SecondhandMarketplace, PortalTextConfig>> = {
  KLEINANZEIGEN:  { titleChannel: 'KLEINANZEIGEN', descChannel: 'KLEINANZEIGEN', titleMax: 65 },
  EBAY:           { titleChannel: 'EBAY',          descChannel: 'EBAY',          titleMax: 80 },
  VINTED:         { titleChannel: 'VINTED',        descChannel: 'VINTED',        titleMax: 80 },
  MARKT_DE:       { titleChannel: 'KLEINANZEIGEN', descChannel: 'GENERIC',       titleMax: 80 },
  QUOKA:          { titleChannel: 'KLEINANZEIGEN', descChannel: 'GENERIC',       titleMax: 80 },
  FACEBOOK:       { titleChannel: 'KLEINANZEIGEN', descChannel: 'GENERIC',       titleMax: 100 },
};

// ─── State types ─────────────────────────────────────────────────────────────

type TextLoadState = 'idle' | 'loading' | 'loaded' | 'error';

interface PortalDraft {
  loadState: TextLoadState;
  title: string;
  description: string;
  quality: DescriptionQualityResult | null;
  priceAlignment: PriceDescriptionAlignment | null;
}

type CopyState = 'idle' | 'copied' | 'error';

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useCopy() {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = async (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    try { await navigator.clipboard.writeText(text); setState('copied'); }
    catch { setState('error'); }
    timer.current = setTimeout(() => setState('idle'), 1800);
  };
  return { state, copy };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AngebotspaketPage() {
  const { id } = useParams<{ id: string }>();
  const [salesGoal, setSalesGoal] = useState<SalesGoal>('BALANCED');
  const [loadingRecs, setLoadingRecs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [recommendations, setRecommendations] = useState<MarketplaceRecommendation[]>([]);
  const [detectedCategory, setDetectedCategory] = useState<string>('');
  const [drafts, setDrafts] = useState<Partial<Record<SecondhandMarketplace, PortalDraft>>>({});

  const loadPortalText = useCallback(
    async (marketplace: SecondhandMarketplace, goal: SalesGoal) => {
      const cfg = TEXT_CONFIGS[marketplace];
      if (!cfg || !id) return;
      setDrafts((prev) => ({
        ...prev,
        [marketplace]: { loadState: 'loading', title: '', description: '', quality: null, priceAlignment: null },
      }));
      try {
        const [titleResult, descResult] = await Promise.all([
          itemsApi.generateTitle(id, cfg.titleChannel),
          itemsApi.generateDescription(id, goal, cfg.descChannel),
        ]);
        setDrafts((prev) => ({
          ...prev,
          [marketplace]: {
            loadState: 'loaded',
            title: titleResult.title,
            description: descResult.descriptionText,
            quality: descResult.quality,
            priceAlignment: descResult.priceAlignment,
          },
        }));
      } catch {
        setDrafts((prev) => ({
          ...prev,
          [marketplace]: { loadState: 'error', title: '', description: '', quality: null, priceAlignment: null },
        }));
      }
    },
    [id],
  );

  const generate = useCallback(
    async (goal: SalesGoal) => {
      if (!id) return;
      setLoadingRecs(true);
      setError(null);
      setDrafts({});

      try {
        const [recResult, priceResult] = await Promise.all([
          itemsApi.marketplaceRecommendations(id, goal),
          itemsApi.priceResearch(id, false, goal),
        ]);

        setRecommendations(recResult.recommendations);
        setDetectedCategory(recResult.detectedCategory);
        setLoadingRecs(false);

        const rec = priceResult.recommendation;
        if (rec) setPrice(rec.listPrice);
        else {
          const medians = priceResult.sources.map((s) => s.median).filter((m): m is number => m !== null);
          if (medians.length) setPrice(Math.round(medians.reduce((a, b) => a + b, 0) / medians.length));
        }

        // Auto-load text for top 2 text-capable portals
        const autoLoad = recResult.recommendations
          .filter((r) => r.marketplace in TEXT_CONFIGS)
          .slice(0, 2);
        await Promise.all(autoLoad.map((r) => loadPortalText(r.marketplace, goal)));
      } catch {
        setError('Generierung fehlgeschlagen. Bitte erneut versuchen.');
        setLoadingRecs(false);
      }
    },
    [id, loadPortalText],
  );

  useEffect(() => {
    void generate(salesGoal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const updateDraft = (
    marketplace: SecondhandMarketplace,
    field: 'title' | 'description',
    value: string,
  ) => {
    setDrafts((prev) => {
      const existing = prev[marketplace];
      if (!existing) return prev;
      return { ...prev, [marketplace]: { ...existing, [field]: value } };
    });
  };

  const worstAlignment = Object.values(drafts)
    .map((d) => d?.priceAlignment)
    .filter((a): a is PriceDescriptionAlignment => a != null)
    .sort((a, b) => a.alignmentScore - b.alignmentScore)[0] ?? null;

  const loadedTextMarkets = recommendations.filter((r) => {
    const d = drafts[r.marketplace];
    return d && (d.loadState === 'loaded' || d.loadState === 'loading' || d.loadState === 'error');
  });

  return (
    <div className="max-w-md mx-auto pb-12">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <Link to={`/items/${id}`} className="text-xs text-ink-faint hover:text-ink-muted">
          ← Zurück zum Artikel
        </Link>
        <span className="text-xs font-bold text-ink-muted uppercase tracking-wide">Angebotspaket</span>
      </div>

      {/* Controls */}
      <div className="px-4 pb-4 flex items-center gap-3">
        <select
          value={salesGoal}
          disabled={loadingRecs}
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
          disabled={loadingRecs}
          onClick={() => generate(salesGoal)}
          className="text-sm font-bold text-accent hover:text-accent-hover disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {loadingRecs ? 'Lädt…' : '↺ Neu'}
        </button>
      </div>

      {error && (
        <div className="mx-4 mb-4 bg-danger-soft border border-danger/20 rounded-xl p-3 text-xs text-danger">
          {error}
        </div>
      )}

      {/* Price block */}
      {price !== null && (
        <div className="mx-4 mb-4 space-y-2">
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
                    {worstAlignment.missingValueSignals.map((s) => (
                      <span key={s} className="text-[10px] bg-surface border border-line rounded-full px-2 py-0.5 text-ink-muted">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Marketplace rankings */}
      <section className="px-4 mb-5">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-bold text-ink-muted uppercase tracking-wide">
            Marktplatz-Empfehlung
          </span>
          {detectedCategory && !loadingRecs && (
            <span className="text-[10px] text-ink-faint">Kategorie: {detectedCategory.split(' > ')[0]}</span>
          )}
        </div>

        <div className="space-y-1.5">
          {loadingRecs
            ? [1, 2, 3].map((i) => <SkeletonLine key={i} className="h-12 rounded-xl" />)
            : recommendations.map((rec) => (
                <MarketplaceRankRow
                  key={rec.marketplace}
                  rec={rec}
                  draftState={drafts[rec.marketplace]?.loadState ?? 'idle'}
                  onLoadText={() => void loadPortalText(rec.marketplace, salesGoal)}
                />
              ))}
        </div>
      </section>

      {/* Portal text cards (loaded portals in recommendation order) */}
      <div className="space-y-4 px-4">
        {loadedTextMarkets.map((rec) => {
          const draft = drafts[rec.marketplace];
          const cfg = TEXT_CONFIGS[rec.marketplace];
          if (!draft || !cfg) return null;
          return (
            <PortalCard
              key={rec.marketplace}
              rec={rec}
              cfg={cfg}
              draft={draft}
              price={price}
              onTitleChange={(v) => updateDraft(rec.marketplace, 'title', v)}
              onDescriptionChange={(v) => updateDraft(rec.marketplace, 'description', v)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── MarketplaceRankRow ───────────────────────────────────────────────────────

const TIME_LABEL: Record<EstimatedTimeToSale, string> = {
  INSTANT: 'Sofort',
  FAST: 'Schnell',
  MEDIUM: 'Mittel',
  SLOW: 'Langsam',
};

function MarketplaceRankRow({
  rec,
  draftState,
  onLoadText,
}: {
  rec: MarketplaceRecommendation;
  draftState: TextLoadState;
  onLoadText: () => void;
}) {
  const isBuyback = rec.type === 'BUYBACK';
  const canLoadText = !isBuyback && rec.marketplace in TEXT_CONFIGS;
  const isLoaded = draftState === 'loaded';
  const isLoading = draftState === 'loading';

  const scoreColor =
    rec.score >= 75
      ? 'bg-accent/10 text-accent border-accent/20'
      : rec.score >= 50
        ? 'bg-warning/10 text-warning border-warning/20'
        : 'bg-line text-ink-faint border-line';

  return (
    <div className="bg-surface border border-line rounded-xl px-3 py-2.5 flex items-start gap-3">
      {/* Rank badge */}
      <span className="text-[11px] font-bold text-ink-faint tabular-nums w-4 pt-0.5 shrink-0">
        #{rec.rank}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-ink">{rec.label}</span>
          <span className={`text-[10px] font-bold border rounded-full px-1.5 py-0.5 tabular-nums ${scoreColor}`}>
            {rec.score}
          </span>
          {isBuyback && (
            <span className="text-[10px] font-bold bg-surface-hover border border-line rounded-full px-1.5 py-0.5 text-ink-faint">
              Ankauf
            </span>
          )}
          <span className="text-[10px] text-ink-faint">{TIME_LABEL[rec.estimatedTimeToSale]}</span>
          {rec.feePercent > 0 && (
            <span className="text-[10px] text-warning">{rec.feePercent}% Gebühr</span>
          )}
        </div>
        {rec.reasons.length > 0 && (
          <p className="text-[11px] text-ink-muted mt-0.5 leading-snug">{rec.reasons[0]}</p>
        )}
        {rec.cautions.length > 0 && (
          <p className="text-[10px] text-warning mt-0.5 leading-snug">⚠ {rec.cautions[0]}</p>
        )}
      </div>

      {/* Action */}
      <div className="shrink-0 pt-0.5">
        {isBuyback ? (
          <a
            href={rec.listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-ink-faint hover:text-accent transition-colors"
          >
            Website ↗
          </a>
        ) : isLoaded ? (
          <span className="text-[11px] font-bold text-accent">✓ Text</span>
        ) : isLoading ? (
          <span className="text-[11px] text-ink-faint animate-pulse">Lädt…</span>
        ) : canLoadText ? (
          <button
            type="button"
            onClick={onLoadText}
            className="text-[11px] font-bold text-ink-faint hover:text-accent transition-colors"
          >
            Text laden
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ─── PortalCard ───────────────────────────────────────────────────────────────

function PortalCard({
  rec,
  cfg,
  draft,
  price,
  onTitleChange,
  onDescriptionChange,
}: {
  rec: MarketplaceRecommendation;
  cfg: PortalTextConfig;
  draft: PortalDraft;
  price: number | null;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
}) {
  const titleCopy = useCopy();
  const descCopy = useCopy();
  const allCopy = useCopy();
  const [showQuality, setShowQuality] = useState(false);

  const loading = draft.loadState === 'loading';
  const isError = draft.loadState === 'error';
  const titleOver = draft.title.length > cfg.titleMax;
  const qualityScore = draft.quality?.score ?? null;
  const hasQualityIssues =
    (draft.quality?.issues.length ?? 0) > 0 ||
    (draft.quality?.attributeCoverage.some((a) => !a.mentioned) ?? false);

  const copyAll = () => {
    const parts = [draft.title];
    if (price !== null) parts.push(`Preis: ${price.toFixed(2)} €`);
    parts.push('', draft.description);
    void allCopy.copy(parts.join('\n').trim());
  };

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink">{rec.label}</span>
          <span className="text-[10px] text-ink-faint">#{rec.rank}</span>
          {!loading && qualityScore !== null && <QualityBadge score={qualityScore} />}
        </div>
        <div className="flex items-center gap-2">
          {!isError && <CopyButton state={allCopy.state} onClick={copyAll} label="Alles kopieren" />}
          <a
            href={rec.listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-ink-muted hover:text-accent transition-colors"
          >
            Portal ↗
          </a>
        </div>
      </div>

      {isError ? (
        <p className="px-4 py-3 text-xs text-danger">Fehler beim Laden. Oben auf „Text laden" klicken.</p>
      ) : (
        <div className="p-4 space-y-3">
          {/* Title */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wide">Titel</span>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] tabular-nums ${titleOver ? 'text-danger font-bold' : 'text-ink-faint'}`}>
                  {draft.title.length}/{cfg.titleMax}
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
                maxLength={cfg.titleMax + 20}
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
                <CopyButton state={descCopy.state} onClick={() => void descCopy.copy(draft.description)} />
              </div>
            </div>

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

          {price !== null && !loading && (
            <div className="flex items-center justify-between text-xs text-ink-faint border-t border-line pt-3">
              <span>Startpreis</span>
              <span className="font-bold text-ink">{price.toFixed(2)} €</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────────────────

function PriceTierBadge({ tier }: { tier: PriceTier }) {
  const config: Record<PriceTier, { label: string; className: string }> = {
    BELOW_MARKET: { label: 'Unter Markt', className: 'text-accent' },
    MARKET:       { label: 'Marktüblich', className: 'text-ink-muted' },
    ABOVE_MARKET: { label: 'Über Median', className: 'text-warning' },
    PREMIUM:      { label: 'Premium',     className: 'text-danger font-bold' },
  };
  const c = config[tier];
  return <span className={c.className}>{c.label}</span>;
}

function QualityBadge({ score }: { score: number }) {
  const className =
    score >= 80
      ? 'bg-accent/10 text-accent border-accent/20'
      : score >= 55
        ? 'bg-warning/10 text-warning border-warning/20'
        : 'bg-danger/10 text-danger border-danger/20';
  return (
    <span className={`text-[10px] font-bold border rounded-full px-1.5 py-0.5 tabular-nums ${className}`} title="Beschreibungsqualität (0–100)">
      Q {score}
    </span>
  );
}

function SeverityIcon({ severity }: { severity: IssueSeverity }) {
  if (severity === 'ERROR') return <span className="text-danger shrink-0">●</span>;
  if (severity === 'WARNING') return <span className="text-warning shrink-0">●</span>;
  return <span className="text-ink-faint shrink-0">●</span>;
}

function CopyButton({ state, onClick, label }: { state: CopyState; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] font-bold transition-colors ${
        state === 'copied' ? 'text-accent' : state === 'error' ? 'text-danger' : 'text-ink-faint hover:text-accent'
      }`}
    >
      {state === 'copied' ? '✓ Kopiert' : state === 'error' ? 'Fehler' : (label ?? 'Kopieren')}
    </button>
  );
}

function SkeletonLine({ className }: { className?: string }) {
  return <div className={`bg-line animate-pulse ${className ?? ''}`} />;
}
