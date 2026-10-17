import { useCallback, useEffect, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { itemsApi } from '../api/items';
import { listingsApi } from '../api/listings';
import { ApiRequestError } from '../api/client';
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
import { shippingPortalsAllowed, toLogisticsProfile } from '../logistics/profile';
import { useToast } from './Toast';
import { ActionBar, Button, Card, Field, Icon, Notice, SectionLabel, Sheet, inputClass } from '../ui';

const SHIPPING_PORTALS = new Set<SecondhandMarketplace>(['EBAY', 'VINTED']);

interface PortalTextConfig {
  titleChannel: ListingChannel;
  descChannel: DescriptionChannel;
  titleMax: number;
}

const TEXT_CONFIGS: Partial<Record<SecondhandMarketplace, PortalTextConfig>> = {
  KLEINANZEIGEN: { titleChannel: 'KLEINANZEIGEN', descChannel: 'KLEINANZEIGEN', titleMax: 65 },
  EBAY: { titleChannel: 'EBAY', descChannel: 'EBAY', titleMax: 80 },
  VINTED: { titleChannel: 'VINTED', descChannel: 'VINTED', titleMax: 80 },
  MARKT_DE: { titleChannel: 'KLEINANZEIGEN', descChannel: 'GENERIC', titleMax: 80 },
  QUOKA: { titleChannel: 'KLEINANZEIGEN', descChannel: 'GENERIC', titleMax: 80 },
  FACEBOOK: { titleChannel: 'KLEINANZEIGEN', descChannel: 'GENERIC', titleMax: 100 },
};

const GOALS: { value: SalesGoal; label: string }[] = [
  { value: 'BALANCED', label: 'Ausgewogen' },
  { value: 'FAST_SALE', label: 'Schnell verkaufen' },
  { value: 'MAX_PROFIT', label: 'Maximaler Erlös' },
  { value: 'MINIMAL_EFFORT', label: 'Minimaler Aufwand' },
];

const DESCRIPTION_MAX = 1500;

type TextLoadState = 'loading' | 'loaded' | 'error';

interface PortalDraft {
  loadState: TextLoadState;
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
      await copyText(text);
      setState('copied');
    } catch {
      setState('error');
    }
    timer.current = setTimeout(() => setState('idle'), 1800);
  };
  return { state, copy };
}

function parsePrice(v: string): number | null {
  const n = parseFloat(v.replace(',', '.'));
  return isNaN(n) || n <= 0 ? null : n;
}

/**
 * Schritt „Inserieren“: Preis, Portal-Empfehlung und fertige Texte je Portal.
 * Mit `onListed` (Status READY) gibt es die Primäraktion „Inseriert“, die
 * das Listing anlegt; ohne (Status LISTED) dient es nur zum erneuten Kopieren.
 */
export function Angebotspaket({ itemId, onListed }: { itemId: string; onListed?: () => void }) {
  const toast = useToast();
  const [salesGoal, setSalesGoal] = useState<SalesGoal>('BALANCED');
  const [loadingRecs, setLoadingRecs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const priceCopy = useCopy();
  const [recommendations, setRecommendations] = useState<MarketplaceRecommendation[]>([]);
  const [detectedCategory, setDetectedCategory] = useState('');
  const [drafts, setDrafts] = useState<Partial<Record<SecondhandMarketplace, PortalDraft>>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [listingPrice, setListingPrice] = useState('');
  const [listingBusy, setListingBusy] = useState(false);
  const [portal, setPortal] = useState<'KLEINANZEIGEN' | 'OTHER'>('KLEINANZEIGEN');
  const [pickupOnlyNote, setPickupOnlyNote] = useState(false);
  const [fix, setFix] = useState<{ projectionId: string; missing: string[] } | null>(null);
  const [fixValues, setFixValues] = useState<Record<string, string>>({});

  const loadPortalText = useCallback(
    async (marketplace: SecondhandMarketplace, goal: SalesGoal) => {
      const cfg = TEXT_CONFIGS[marketplace];
      if (!cfg) return;
      setDrafts((prev) => ({
        ...prev,
        [marketplace]: { loadState: 'loading', title: '', description: '', quality: null, priceAlignment: null },
      }));
      try {
        const [titleResult, descResult] = await Promise.all([
          itemsApi.generateTitle(itemId, cfg.titleChannel),
          itemsApi.generateDescription(itemId, goal, cfg.descChannel),
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
    [itemId],
  );

  const generate = useCallback(
    async (goal: SalesGoal) => {
      setLoadingRecs(true);
      setError(null);
      setDrafts({});
      try {
        const [detail, recResult, priceResult] = await Promise.all([
          itemsApi.get(itemId),
          itemsApi.marketplaceRecommendations(itemId, goal),
          itemsApi.priceResearch(itemId, false, goal),
        ]);
        const profile = toLogisticsProfile(detail.item);
        const hideShipping = profile.captured && !shippingPortalsAllowed(profile);
        setPickupOnlyNote(hideShipping);
        const visible = hideShipping
          ? recResult.recommendations.filter((rec) => !SHIPPING_PORTALS.has(rec.marketplace))
          : recResult.recommendations;
        setRecommendations(visible);
        setDetectedCategory(recResult.detectedCategory);
        setLoadingRecs(false);

        const rec = priceResult.recommendation;
        if (rec) setPrice(rec.listPrice.toFixed(2));
        else {
          const medians = priceResult.sources.map((s) => s.median).filter((m): m is number => m !== null);
          if (medians.length) setPrice(Math.round(medians.reduce((a, b) => a + b, 0) / medians.length).toFixed(2));
        }

        const autoLoad = visible.filter((r) => r.marketplace in TEXT_CONFIGS).slice(0, 2);
        await Promise.all(autoLoad.map((r) => loadPortalText(r.marketplace, goal)));
      } catch {
        setError('Generierung fehlgeschlagen. Bitte erneut versuchen.');
        setLoadingRecs(false);
      }
    },
    [itemId, loadPortalText],
  );

  useEffect(() => {
    void generate('BALANCED');
  }, [generate]);

  const updateDraft = (marketplace: SecondhandMarketplace, field: 'title' | 'description', value: string) => {
    setDrafts((prev) => {
      const existing = prev[marketplace];
      return existing ? { ...prev, [marketplace]: { ...existing, [field]: value } } : prev;
    });
  };

  const worstAlignment =
    Object.values(drafts)
      .map((d) => d?.priceAlignment)
      .filter((a): a is PriceDescriptionAlignment => a != null)
      .sort((a, b) => a.alignmentScore - b.alignmentScore)[0] ?? null;

  const textMarkets = recommendations.filter((r) => drafts[r.marketplace]);
  const firstDescription = textMarkets.map((r) => drafts[r.marketplace]).find((d) => d?.loadState === 'loaded')?.description;

  // Kleinanzeigen hat keine API: der Nutzer bestätigt hier selbst, dass die
  // Anzeige online ist — das ist genau der Human-Gate-Schritt confirm-published.
  // Fehlen Pflichtangaben der Kategorie (Capability-Check), werden sie im Sheet
  // nachgefragt und derselbe Eintrag danach erneut veröffentlicht.
  const publishKleinanzeigen = async (projectionId: string): Promise<boolean> => {
    try {
      await listingsApi.publish(projectionId);
      await listingsApi.confirmPublished(projectionId);
      return true;
    } catch (e) {
      const missing = e instanceof ApiRequestError && e.body.error_code === 'ERR_CAPABILITY_CHECK_FAILED' ? e.body.details.missing : null;
      if (Array.isArray(missing) && missing.length > 0) {
        setFix({ projectionId, missing: missing as string[] });
        setFixValues({});
      } else {
        setFix(null);
        setSheetOpen(false);
        toast('Listing angelegt — Kleinanzeigen-Status bitte unter „Online auf“ bestätigen.', 'error');
        onListed?.();
      }
      return false;
    }
  };

  const finishListed = () => {
    setFix(null);
    setSheetOpen(false);
    toast('Als inseriert markiert', 'success');
    onListed?.();
  };

  const createListing = async () => {
    const parsed = parsePrice(listingPrice);
    if (parsed === null) return;
    setListingBusy(true);
    let listingId: string;
    try {
      listingId = (await itemsApi.prepareListing(itemId, parsed, firstDescription || undefined)).id;
    } catch {
      toast('Listing konnte nicht angelegt werden.', 'error');
      setListingBusy(false);
      return;
    }
    if (portal === 'KLEINANZEIGEN') {
      let projectionId: string;
      try {
        projectionId = (await listingsApi.create(listingId, 'KLEINANZEIGEN')).id;
      } catch {
        setListingBusy(false);
        setSheetOpen(false);
        toast('Listing angelegt — Kleinanzeigen-Status bitte unter „Online auf“ bestätigen.', 'error');
        onListed?.();
        return;
      }
      const ok = await publishKleinanzeigen(projectionId);
      setListingBusy(false);
      if (ok) finishListed();
      return;
    }
    setListingBusy(false);
    finishListed();
  };

  const completeMissingFacts = async () => {
    if (!fix) return;
    setListingBusy(true);
    try {
      for (const key of fix.missing) {
        await itemsApi.confirmAttribute(itemId, key, fixValues[key]?.trim());
      }
    } catch (e) {
      toast(e instanceof ApiRequestError ? e.body.message : 'Angaben konnten nicht gespeichert werden.', 'error');
      setListingBusy(false);
      return;
    }
    const ok = await publishKleinanzeigen(fix.projectionId);
    setListingBusy(false);
    if (ok) finishListed();
  };

  const closeSheet = () => {
    // Listing existiert bereits (Artikel ist LISTED) — Seite neu laden, damit sie nicht READY zeigt.
    if (fix) {
      setFix(null);
      onListed?.();
    }
    setSheetOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <select
          value={salesGoal}
          disabled={loadingRecs}
          onChange={(e) => {
            const goal = e.target.value as SalesGoal;
            setSalesGoal(goal);
            void generate(goal);
          }}
          className={`${inputClass} flex-1`}
          aria-label="Verkaufsziel"
        >
          {GOALS.map((g) => (
            <option key={g.value} value={g.value}>
              Ziel: {g.label}
            </option>
          ))}
        </select>
        <Button variant="secondary" icon="refresh" loading={loadingRecs} onClick={() => void generate(salesGoal)} aria-label="Neu erzeugen" />
      </div>

      {error && (
        <Notice tone="danger">
          {error}{' '}
          <button type="button" onClick={() => void generate(salesGoal)} className="underline font-semibold">
            Erneut versuchen
          </button>
        </Notice>
      )}

      <section>
        <SectionLabel>Startpreis</SectionLabel>
        <Card className="p-4 space-y-2">
          {loadingRecs && !price ? (
            <SkeletonLine className="h-11 rounded-control" />
          ) : (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={`${inputClass} pr-8 text-title tabular-nums`}
                  aria-label="Startpreis in Euro"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">€</span>
              </div>
              <CopyButton state={priceCopy.state} onClick={() => void priceCopy.copy(price)} />
            </div>
          )}
          {worstAlignment && (
            <p className="text-label font-normal text-ink-faint">
              Preis-Einordnung: <PriceTierLabel tier={worstAlignment.priceTier} />
            </p>
          )}
          {worstAlignment && worstAlignment.alignmentScore < 75 && worstAlignment.issues.length > 0 && (
            <Notice tone="warning">
              {worstAlignment.issues.map((issue, i) => (
                <p key={i}>{issue.message}</p>
              ))}
              {worstAlignment.missingValueSignals.length > 0 && (
                <p className="mt-1">Hilfreich wären: {worstAlignment.missingValueSignals.join(', ')}</p>
              )}
            </Notice>
          )}
        </Card>
      </section>

      <section>
        <SectionLabel action={detectedCategory && !loadingRecs ? <span className="text-label font-normal text-ink-faint">{detectedCategory.split(' > ')[0]}</span> : undefined}>
          Wo verkaufen?
        </SectionLabel>
        {pickupOnlyNote && !loadingRecs && (
          <p className="text-label font-normal text-ink-muted mb-2">
            Versandportale entfallen. Der Artikel ist sperrig oder nur zur Abholung.
          </p>
        )}
        <div className="space-y-2">
          {loadingRecs
            ? [1, 2, 3].map((i) => <SkeletonLine key={i} className="h-16 rounded-card" />)
            : recommendations.map((rec) => (
                <MarketplaceRankRow
                  key={rec.marketplace}
                  rec={rec}
                  draftState={drafts[rec.marketplace]?.loadState}
                  onLoadText={() => void loadPortalText(rec.marketplace, salesGoal)}
                />
              ))}
        </div>
      </section>

      {textMarkets.length > 0 && (
        <section className="space-y-3">
          <SectionLabel>Texte zum Kopieren</SectionLabel>
          {textMarkets.map((rec) => {
            const draft = drafts[rec.marketplace]!;
            const cfg = TEXT_CONFIGS[rec.marketplace]!;
            return (
              <PortalCard
                key={rec.marketplace}
                rec={rec}
                cfg={cfg}
                draft={draft}
                price={price}
                onRetry={() => void loadPortalText(rec.marketplace, salesGoal)}
                onTitleChange={(v) => updateDraft(rec.marketplace, 'title', v)}
                onDescriptionChange={(v) => updateDraft(rec.marketplace, 'description', v)}
              />
            );
          })}
        </section>
      )}

      {onListed && !loadingRecs && (
        <ActionBar>
          <Button
            size="lg"
            icon="check"
            onClick={() => {
              setListingPrice(price);
              setSheetOpen(true);
            }}
          >
            Inseriert
          </Button>
        </ActionBar>
      )}

      <Sheet open={sheetOpen} onClose={closeSheet} title={fix ? 'Noch kurz ergänzen' : 'Als inseriert markieren'}>
        {fix ? (
          <div className="space-y-4">
            <p className="text-body text-ink-muted">
              Kleinanzeigen braucht für diese Kategorie noch folgende Angaben. Danach wird die Anzeige als online markiert.
            </p>
            {fix.missing.map((key) => (
              <Field key={key} label={FACT_LABELS[key] ?? key}>
                {key === 'functionChecked' || key === 'category' ? (
                  <select
                    value={fixValues[key] ?? ''}
                    onChange={(e) => setFixValues((v) => ({ ...v, [key]: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="">Bitte wählen</option>
                    {(key === 'functionChecked' ? FUNCTION_CHECKED_OPTIONS : CATEGORY_OPTIONS).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={fixValues[key] ?? ''}
                    onChange={(e) => setFixValues((v) => ({ ...v, [key]: e.target.value }))}
                    placeholder={FACT_PLACEHOLDERS[key]}
                    className={inputClass}
                  />
                )}
              </Field>
            ))}
            <Button
              block
              size="lg"
              loading={listingBusy}
              disabled={fix.missing.some((key) => !fixValues[key]?.trim())}
              onClick={() => void completeMissingFacts()}
            >
              Speichern und als online markieren
            </Button>
          </div>
        ) : (
        <div className="space-y-4">
          <p className="text-body text-ink-muted">Wo ist die Anzeige online, und zu welchem Preis?</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Portal">
            {(
              [
                ['KLEINANZEIGEN', 'Kleinanzeigen'],
                ['OTHER', 'Anderes Portal'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={portal === value}
                onClick={() => setPortal(value)}
                className={`h-11 rounded-control border text-body font-semibold transition-colors ${
                  portal === value ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-muted hover:bg-surface-hover'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {portal === 'OTHER' && (
            <p className="text-label font-normal text-ink-faint">
              Andere Portale werden nicht verfolgt. Den Verkauf meldest du später selbst, ohne Verkaufspreis.
            </p>
          )}
          <Field label="Preis in der Anzeige (€)">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              placeholder="z. B. 29.99"
              value={listingPrice}
              onChange={(e) => setListingPrice(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Button block size="lg" loading={listingBusy} disabled={parsePrice(listingPrice) === null} onClick={() => void createListing()}>
            Bestätigen
          </Button>
        </div>
        )}
      </Sheet>
    </div>
  );
}

const FACT_LABELS: Record<string, string> = {
  category: 'Kategorie',
  size: 'Größe',
  brand: 'Marke',
  measurements: 'Maße',
  functionChecked: 'Funktion geprüft?',
};

const FACT_PLACEHOLDERS: Record<string, string> = {
  size: 'z. B. M, 42 oder 98 cm',
  brand: 'z. B. Bosch, Nike',
  measurements: 'z. B. 80 × 40 × 30 cm',
};

const FUNCTION_CHECKED_OPTIONS = [
  { value: 'ja', label: 'Ja, funktioniert' },
  { value: 'nein', label: 'Nein / nicht geprüft' },
];

const CATEGORY_OPTIONS = ['Kleidung', 'Schuhe', 'Elektronik', 'Medien', 'Haushalt', 'Möbel', 'Sonstiges'].map((c) => ({ value: c, label: c }));

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
  draftState: TextLoadState | undefined;
  onLoadText: () => void;
}) {
  const isBuyback = rec.type === 'BUYBACK';
  const canLoadText = !isBuyback && rec.marketplace in TEXT_CONFIGS;
  const scoreClass =
    rec.score >= 75
      ? 'bg-accent-soft text-accent'
      : rec.score >= 50
        ? 'bg-warning-soft text-warning'
        : 'bg-surface-hover text-ink-faint';

  return (
    <Card className="px-3 py-3 flex items-start gap-3">
      <span className={`w-10 h-10 rounded-control shrink-0 flex items-center justify-center text-label tabular-nums ${scoreClass}`} title="Eignung (0–100)">
        {rec.score}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
          <span className="text-body font-semibold text-ink">{rec.label}</span>
          {isBuyback && <span className="text-micro uppercase text-ink-faint">Ankauf</span>}
          <span className="text-label font-normal text-ink-faint">{TIME_LABEL[rec.estimatedTimeToSale]}</span>
          {rec.feePercent > 0 && <span className="text-label font-normal text-warning">{rec.feePercent} % Gebühr</span>}
        </div>
        {rec.reasons[0] && <p className="text-label font-normal text-ink-muted mt-0.5">{rec.reasons[0]}</p>}
        {rec.cautions[0] && <p className="text-label font-normal text-warning mt-0.5">{rec.cautions[0]}</p>}
      </div>
      <div className="shrink-0 self-center">
        {isBuyback ? (
          <a href={rec.listingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-label text-ink-muted hover:text-accent">
            Website <Icon name="external" size={13} />
          </a>
        ) : draftState === 'loaded' ? (
          <span className="inline-flex items-center gap-1 text-label text-accent">
            <Icon name="check" size={14} strokeWidth={2.6} /> Text
          </span>
        ) : draftState === 'loading' ? (
          <span className="text-label text-ink-faint animate-pulse">Lädt…</span>
        ) : canLoadText ? (
          <Button variant="ghost" size="sm" onClick={onLoadText}>
            Text erzeugen
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function PortalCard({
  rec,
  cfg,
  draft,
  price,
  onRetry,
  onTitleChange,
  onDescriptionChange,
}: {
  rec: MarketplaceRecommendation;
  cfg: PortalTextConfig;
  draft: PortalDraft;
  price: string;
  onRetry: () => void;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
}) {
  const titleCopy = useCopy();
  const descCopy = useCopy();
  const allCopy = useCopy();
  const [showQuality, setShowQuality] = useState(false);
  const loading = draft.loadState === 'loading';
  const quality = draft.quality;
  const hasQualityIssues = (quality?.issues.length ?? 0) > 0 || (quality?.attributeCoverage.some((a) => !a.mentioned) ?? false);

  const copyAll = () => {
    const parts = [draft.title];
    if (parsePrice(price) !== null) parts.push(`Preis: ${price} €`);
    parts.push('', draft.description);
    void allCopy.copy(parts.join('\n').trim());
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-body font-semibold text-ink truncate">{rec.label}</span>
          {!loading && quality && <QualityBadge score={quality.score} />}
        </div>
        <a
          href={rec.listingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-label text-ink-muted hover:text-accent shrink-0"
        >
          Portal öffnen <Icon name="external" size={13} />
        </a>
      </div>

      {draft.loadState === 'error' ? (
        <div className="p-4">
          <Notice tone="danger">
            Text konnte nicht erzeugt werden.{' '}
            <button type="button" onClick={onRetry} className="underline font-semibold">
              Erneut versuchen
            </button>
          </Notice>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <Field
            label="Titel"
            count={loading ? undefined : { value: draft.title.length, max: cfg.titleMax }}
            action={<CopyButton state={titleCopy.state} onClick={() => void titleCopy.copy(draft.title)} />}
          >
            {loading ? (
              <SkeletonLine className="h-11 rounded-control" />
            ) : (
              <input type="text" value={draft.title} onChange={(e) => onTitleChange(e.target.value)} className={inputClass} />
            )}
          </Field>

          <Field
            label="Beschreibung"
            count={loading ? undefined : { value: draft.description.length, max: DESCRIPTION_MAX }}
            action={<CopyButton state={descCopy.state} onClick={() => void descCopy.copy(draft.description)} />}
          >
            {loading ? (
              <SkeletonLine className="h-28 rounded-control" />
            ) : (
              <textarea rows={6} value={draft.description} onChange={(e) => onDescriptionChange(e.target.value)} className={`${inputClass} resize-y`} />
            )}
          </Field>

          {!loading && hasQualityIssues && quality && (
            <div>
              <button type="button" onClick={() => setShowQuality((v) => !v)} className="text-label text-ink-muted hover:text-accent" aria-expanded={showQuality}>
                {showQuality ? 'Hinweise ausblenden' : 'Hinweise zur Beschreibung anzeigen'}
              </button>
              {showQuality && (
                <div className="mt-2 space-y-2">
                  {quality.issues.map((issue, i) => (
                    <p key={i} className="flex gap-2 text-label font-normal text-ink-muted">
                      <SeverityDot severity={issue.severity} />
                      {issue.message}
                    </p>
                  ))}
                  {quality.attributeCoverage.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {quality.attributeCoverage.map((a) => (
                        <span
                          key={a.key}
                          className={`text-label font-normal rounded-full px-2 py-0.5 ${a.mentioned ? 'bg-accent-soft text-accent' : 'bg-danger-soft text-danger'}`}
                        >
                          {a.key}: {a.value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!loading && (
            <Button block variant="secondary" icon={allCopy.state === 'copied' ? 'check' : 'copy'} onClick={copyAll}>
              {allCopy.state === 'copied' ? 'Titel, Preis und Text kopiert' : allCopy.state === 'error' ? 'Kopieren fehlgeschlagen' : 'Alles kopieren'}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function PriceTierLabel({ tier }: { tier: PriceTier }) {
  const config: Record<PriceTier, { label: string; className: string }> = {
    BELOW_MARKET: { label: 'unter Markt', className: 'text-accent' },
    MARKET: { label: 'marktüblich', className: 'text-ink-muted' },
    ABOVE_MARKET: { label: 'über Median', className: 'text-warning' },
    PREMIUM: { label: 'Premium', className: 'text-danger' },
  };
  const c = config[tier];
  return <span className={`font-semibold ${c.className}`}>{c.label}</span>;
}

function QualityBadge({ score }: { score: number }) {
  const cls = score >= 80 ? 'bg-accent-soft text-accent' : score >= 55 ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger';
  return (
    <span className={`text-micro rounded-full px-2 h-5 inline-flex items-center tabular-nums ${cls}`} title="Beschreibungsqualität (0–100)">
      Q {score}
    </span>
  );
}

function SeverityDot({ severity }: { severity: IssueSeverity }) {
  const cls = severity === 'ERROR' ? 'bg-danger' : severity === 'WARNING' ? 'bg-warning' : 'bg-ink-faint';
  return <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${cls}`} aria-hidden="true" />;
}

function CopyButton({ state, onClick }: { state: CopyState; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-label transition-colors ${
        state === 'copied' ? 'text-accent' : state === 'error' ? 'text-danger' : 'text-ink-muted hover:text-accent'
      }`}
    >
      <Icon name={state === 'copied' ? 'check' : 'copy'} size={14} />
      {state === 'copied' ? 'Kopiert' : state === 'error' ? 'Fehler' : 'Kopieren'}
    </button>
  );
}

function SkeletonLine({ className }: { className?: string }) {
  return <div className={`bg-line animate-pulse ${className ?? ''}`} />;
}
