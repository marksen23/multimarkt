import { useMemo, useState } from 'react';
import { ApiRequestError } from '../api/client';
import { itemsApi } from '../api/items';
import type { ItemDetail } from '../api/types';
import { RESALE_CATEGORIES, categoryGaps, factLabel } from '../category/taxonomy';
import { ActionBar, Button, Card, Field, Icon, Notice, inputClass } from '../ui';

const CONDITION_OPTIONS = ['Neu', 'Wie neu', 'Gut', 'Gebraucht', 'Defekt'];

// Maps AI condition values (English enum from Gemini prompt) to display labels
const CONDITION_MAP: Record<string, string> = {
  new: 'Neu',
  like_new: 'Wie neu',
  good: 'Gut',
  fair: 'Gebraucht',
  defective: 'Defekt',
};

/** Spiegelt UNCERTAIN_CONFIDENCE in backend/src/domain/ai/vision-listing.ts */
const UNCERTAIN_BELOW = 0.65;

const HIDDEN_REVIEW_KEYS = new Set(['condition', 'title', 'description', 'searchTerms', 'model']);

const TAXONOMY_KEYS = new Set(['category', 'size', 'measurements', 'brand', 'functionChecked']);

function isUncertain(confidence: number | null | undefined): boolean {
  return typeof confidence === 'number' && confidence < UNCERTAIN_BELOW;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.body.message : fallback;
}

interface Props {
  detail: ItemDetail;
  onConfirmCondition: (condition: string) => Promise<void>;
  onConfirmAttribute: (key: string, value?: string) => Promise<void>;
  onReload: () => void;
  saving: boolean;
}

/**
 * Adaptiver Review-Flow (T09: Human-in-the-Loop).
 *
 * Zeigt nur noch, was wirklich menschliche Entscheidung braucht:
 * - UNKNOWN-Attribute (KI hatte keine Antwort) → gezielte Fragen
 * - INFERRED-Attribute (niedrige Konfidenz) → Bestätigungsprompts
 * - condition → immer menschlich bestätigt, aber KI-Vorschlag vorselektiert
 * - USER_CONFIRMED-Attribute (hohe Konfidenz ≥ 0.85) → werden nur als
 *   Zusammenfassung angezeigt, brauchen keine Aktion mehr
 */
export function SmartReviewPanel({
  detail,
  onConfirmCondition,
  onConfirmAttribute,
  onReload,
  saving,
}: Props) {
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [hint, setHint] = useState('');
  const titleSource =
    detail.item.title ??
    detail.attributes.find((attribute) => attribute.attributeKey === 'title')?.attributeValue ??
    '';
  const modelSource =
    detail.attributes.find((attribute) => attribute.attributeKey === 'model')?.attributeValue ?? '';
  const descriptionSource =
    detail.attributes.find((attribute) => attribute.attributeKey === 'description')?.attributeValue ?? '';
  const draftSource = `${detail.item.updatedAt}|${titleSource}|${modelSource}|${descriptionSource}`;
  const [seenDraftSource, setSeenDraftSource] = useState(draftSource);
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const [descriptionOverride, setDescriptionOverride] = useState<string | null>(null);
  if (seenDraftSource !== draftSource) {
    setSeenDraftSource(draftSource);
    setTitleOverride(null);
    setModelOverride(null);
    setDescriptionOverride(null);
  }
  const titleDraft = titleOverride ?? titleSource;
  const modelDraft = modelOverride ?? modelSource;
  const descriptionDraft = descriptionOverride ?? descriptionSource;

  const reanalyze = async () => {
    setReanalyzing(true);
    setReanalyzeError(null);
    try {
      await itemsApi.reanalyze(detail.item.id, hint);
      onReload();
    } catch (error) {
      setReanalyzeError(errorMessage(error, 'Re-Analyse fehlgeschlagen — bitte erneut versuchen'));
    } finally {
      setReanalyzing(false);
    }
  };

  const uploadAndReanalyze = async () => {
    if (!newPhotos.length) return;
    setUploadingPhotos(true);
    setUploadProgress(0);
    setReanalyzeError(null);
    try {
      await itemsApi.uploadMorePhotos(detail.item.id, newPhotos, (f) => setUploadProgress(f), hint);
      setNewPhotos([]);
      onReload();
    } catch (error) {
      setReanalyzeError(errorMessage(error, 'Foto-Upload fehlgeschlagen — bitte erneut versuchen'));
    } finally {
      setUploadingPhotos(false);
      setUploadProgress(0);
    }
  };
  // Pre-select the AI's condition guess if available
  const aiConditionAttr = detail.attributes.find(
    (a) => a.attributeKey === 'condition' && a.attributeValue,
  );
  const aiConditionMapped = aiConditionAttr?.attributeValue
    ? (CONDITION_MAP[aiConditionAttr.attributeValue.toLowerCase()] ?? null)
    : null;

  const [selectedCondition, setSelectedCondition] = useState<string | null>(
    detail.item.condition ?? aiConditionMapped,
  );
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [missingDrafts, setMissingDrafts] = useState<Record<string, string>>({});

  // Exclude condition from attribute lists — it's handled by the condition picker
  const nonConditionAttrs = detail.attributes.filter((a) => a.attributeKey !== 'condition');

  const gapKeys = useMemo(() => categoryGaps(detail.attributes), [detail.attributes]);
  const extraMissing = useMemo(
    () =>
      nonConditionAttrs.filter(
        (a) =>
          a.truthState === 'UNKNOWN' &&
          !TAXONOMY_KEYS.has(a.attributeKey) &&
          !HIDDEN_REVIEW_KEYS.has(a.attributeKey) &&
          !gapKeys.includes(a.attributeKey),
      ),
    [nonConditionAttrs, gapKeys],
  );
  const missingCount = gapKeys.length + extraMissing.length;
  const inferred = useMemo(
    () =>
      nonConditionAttrs
        .filter((a) => a.truthState === 'INFERRED' && !HIDDEN_REVIEW_KEYS.has(a.attributeKey))
        .sort((a, b) => Number(isUncertain(b.confidence)) - Number(isUncertain(a.confidence))),
    [nonConditionAttrs],
  );
  const autoConfirmed = useMemo(
    () =>
      detail.attributes.filter(
        (a) => a.truthState === 'USER_CONFIRMED' && !HIDDEN_REVIEW_KEYS.has(a.attributeKey),
      ),
    [detail.attributes],
  );
  const titleAttr = detail.attributes.find((attribute) => attribute.attributeKey === 'title');
  const modelAttr = detail.attributes.find((attribute) => attribute.attributeKey === 'model');
  const descriptionAttr = detail.attributes.find((attribute) => attribute.attributeKey === 'description');
  const showUncertainNote =
    isUncertain(titleAttr?.confidence) ||
    isUncertain(modelAttr?.confidence) ||
    isUncertain(descriptionAttr?.confidence) ||
    isUncertain(aiConditionAttr?.confidence) ||
    inferred.some((attribute) => isUncertain(attribute.confidence));

  const totalQuestions = missingCount + inferred.length + 1; // +1 for condition
  const answeredQuestions =
    (selectedCondition !== null ? 1 : 0) +
    inferred.filter((a) => a.truthState === 'USER_CONFIRMED').length;
  const isConditionConfirmed = detail.item.condition !== null;
  const canSave = selectedCondition !== null;
  const anyActionInProgress = saving || savingKey !== null;

  const flushDrafts = async () => {
    const title = titleDraft.trim();
    if (title && title !== (detail.item.title ?? '').trim()) {
      await itemsApi.updateTitle(detail.item.id, title);
      await itemsApi.confirmAttribute(detail.item.id, 'title', title);
    }
    const model = modelDraft.trim();
    if (model && model !== (modelAttr?.attributeValue ?? '').trim()) {
      await itemsApi.confirmAttribute(detail.item.id, 'model', model);
    }
    const description = descriptionDraft.trim();
    if (description && description !== (descriptionAttr?.attributeValue ?? '').trim()) {
      await itemsApi.confirmAttribute(detail.item.id, 'description', description);
    }
  };

  const confirmAttr = async (key: string, value?: string) => {
    setSavingKey(key);
    try {
      await onConfirmAttribute(key, value);
      setEditingKey(null);
      setEditValue('');
    } finally {
      setSavingKey(null);
    }
  };

  // Determine if this is a "one-tap" scenario (only condition needed)
  const isOneTap = missingCount === 0 && inferred.length === 0;

  return (
    <div>
      <header className="bg-surface/90 backdrop-blur p-4 border-b border-line sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title text-ink">
              {isOneTap ? 'Fast fertig!' : 'Kurze Fragen'}
            </h1>
            <p aria-live="polite" className="text-label font-normal text-ink-muted mt-0.5">
              {isOneTap
                ? 'KI hat alles erkannt — nur Zustand bestätigen'
                : `${missingCount + inferred.length + 1} Angabe${missingCount + inferred.length + 1 !== 1 ? 'n' : ''} nötig`}
            </p>
          </div>
          {autoConfirmed.length > 0 && (
            <span className="inline-flex items-center gap-1 text-label bg-accent-soft text-accent px-2 py-1 rounded-full">
              {autoConfirmed.length} auto <Icon name="check" size={12} strokeWidth={3} />
            </span>
          )}
        </div>
        {detail.attributes.some((attribute) => attribute.source.startsWith('mock-gemini')) && (
          <Notice tone="warning">
            Die Fotos wurden nicht gelesen. Ohne GEMINI_API_KEY bleibt die Erkennung leer — Kategorie und Merkmale
            trägst du hier selbst ein.
          </Notice>
        )}
        {detail.attributes.some((attribute) => attribute.source.endsWith(':auto')) && (
          <Notice tone="warning">
            Einige Angaben wurden früher ohne deine Prüfung als bestätigt gespeichert. „KI-Analyse wiederholen“ setzt
            sie zurück.
          </Notice>
        )}
        {reanalyzeError && (
          <Notice tone="danger">{reanalyzeError}</Notice>
        )}
        {/* Progress bar */}
        <div
          role="progressbar"
          aria-valuenow={totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Fortschritt"
          className="mt-3 h-1.5 bg-line rounded-full overflow-hidden"
        >
          <div
            className="h-full bg-accent rounded-full transition-all duration-300"
            style={{
              width: `${totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0}%`,
            }}
          />
        </div>
      </header>

      <div className="p-4 space-y-4">
        <Card className="p-4 space-y-4">
          {showUncertainNote && (
            <Notice tone="warning">
              Gelb markierte Angaben sind unsicher. Ein Foto vom Etikett oder Typenschild und ein kurzer Hinweis
              verbessern die nächste Analyse.
            </Notice>
          )}
          <Field
            label="Titel"
            hint={
              titleAttr?.attributeValue
                ? isUncertain(titleAttr.confidence)
                  ? 'Unsicher — bitte kurz prüfen'
                  : 'Vorschlag aus den Fotos'
                : detail.item.title
                  ? 'Dein Titel. Die Analyse ersetzt ihn nicht.'
                  : 'Wird aus den Fotos vorgeschlagen, sobald die Analyse etwas erkennt'
            }
          >
            <input
              value={titleDraft}
              onChange={(event) => setTitleOverride(event.target.value)}
              placeholder="z.B. Bosch GBH 2-28 F Schlagbohrmaschine"
              aria-label="Titel"
              className={inputClass}
            />
          </Field>
          <Field
            label="Modell"
            hint={
              !modelAttr?.attributeValue
                ? 'Nur ausfüllen, wenn es auf dem Etikett oder Typenschild steht'
                : isUncertain(modelAttr.confidence)
                  ? 'Unsicher — nur übernehmen, wenn es lesbar ist'
                  : 'Vom Typenschild oder Etikett'
            }
          >
            <input
              value={modelDraft}
              onChange={(event) => setModelOverride(event.target.value)}
              placeholder="z.B. GBH 2-28 F"
              aria-label="Modell"
              className={inputClass}
            />
          </Field>
          <Field
            label="Beschreibung"
            hint={
              !descriptionAttr?.attributeValue
                ? 'Kurzer Text aus dem, was auf den Fotos zu sehen ist'
                : isUncertain(descriptionAttr.confidence)
                  ? 'Unsicher — bitte kurz prüfen'
                  : 'Zwei bis vier Sätze aus den Fotos'
            }
          >
            <textarea
              value={descriptionDraft}
              onChange={(event) => setDescriptionOverride(event.target.value)}
              placeholder="Was es ist, welcher Zustand, welche Mängel"
              aria-label="Beschreibung"
              rows={4}
              className={inputClass}
            />
          </Field>
        </Card>

        {gapKeys.map((key) => (
          <div key={key} className="bg-danger/5 p-4 rounded-card border border-danger/20 space-y-2">
            <label className="block text-body font-bold text-ink">
              {key === 'category'
                ? 'Welche Kategorie passt?'
                : key === 'functionChecked'
                  ? 'Funktioniert der Artikel?'
                  : `${factLabel(key)}?`}
            </label>
            <p className="text-label font-normal text-ink-muted">
              Pflichtangabe dieser Kategorie — auf dem Foto nicht erkennbar
            </p>
            {key === 'functionChecked' ? (
              <div className="grid grid-cols-2 gap-2">
                {(['ja', 'nein'] as const).map((answer) => (
                  <Button
                    key={answer}
                    variant="secondary"
                    disabled={anyActionInProgress}
                    loading={savingKey === key}
                    onClick={() => confirmAttr(key, answer)}
                  >
                    {answer === 'ja' ? 'Ja' : 'Nein'}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="flex gap-2">
                {key === 'category' ? (
                  <select
                    value={missingDrafts.category ?? ''}
                    aria-label="Kategorie"
                    onChange={(e) => setMissingDrafts((prev) => ({ ...prev, category: e.target.value }))}
                    className={`${inputClass} flex-1 min-w-0`}
                  >
                    <option value="">Kategorie wählen…</option>
                    {RESALE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    aria-label={factLabel(key)}
                    placeholder={`${factLabel(key)} eingeben…`}
                    value={missingDrafts[key] ?? ''}
                    onChange={(e) => setMissingDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                    className={`${inputClass} flex-1 min-w-0`}
                  />
                )}
                <Button
                  disabled={anyActionInProgress || !missingDrafts[key]?.trim()}
                  loading={savingKey === key}
                  onClick={() => confirmAttr(key, missingDrafts[key])}
                >
                  OK
                </Button>
              </div>
            )}
          </div>
        ))}

        {/* UNKNOWN attributes outside the category taxonomy */}
        {extraMissing.map((a) => (
          <div key={a.id} className="bg-danger/5 p-4 rounded-card border border-danger/20 space-y-2">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 w-4 h-4 rounded-full bg-danger/20 flex items-center justify-center shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-danger" />
              </span>
              <div className="flex-1 min-w-0">
                <label className="block text-body font-bold text-ink">
                  {factLabel(a.attributeKey)}?
                </label>
                <p className="text-label font-normal text-ink-muted mt-0.5">
                  Auf dem Foto nicht erkennbar — bitte ergänzen
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                aria-label={factLabel(a.attributeKey)}
                placeholder={`${factLabel(a.attributeKey)} eingeben…`}
                value={missingDrafts[a.attributeKey] ?? ''}
                onChange={(e) =>
                  setMissingDrafts((prev) => ({ ...prev, [a.attributeKey]: e.target.value }))
                }
                className={`${inputClass} flex-1 min-w-0`}
              />
              <Button
                disabled={
                  anyActionInProgress ||
                  !missingDrafts[a.attributeKey]?.trim()
                }
                loading={savingKey === a.attributeKey}
                onClick={() => confirmAttr(a.attributeKey, missingDrafts[a.attributeKey])}
              >
                OK
              </Button>
            </div>
          </div>
        ))}

        {/* INFERRED attributes — AI guessed, needs confirmation */}
        {inferred.length > 0 && (
          <Card className="overflow-hidden">
            <div className="px-4 py-2.5 bg-warning/5 border-b border-warning/20 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-warning" />
              <span className="text-micro uppercase text-warning">
                KI-Vorschläge — bitte prüfen
              </span>
            </div>
            <div className="divide-y divide-line">
              {inferred.map((a) => (
                <div key={a.id} className={`p-3 space-y-2 ${isUncertain(a.confidence) ? 'bg-warning/10' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-micro uppercase capitalize text-ink-faint block">
                        {factLabel(a.attributeKey)}
                        {isUncertain(a.confidence) && (
                          <span className="ml-2 normal-case text-warning">Unsicher</span>
                        )}
                      </span>
                      <span className="font-semibold text-ink text-body truncate block">
                        {a.attributeValue}
                      </span>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={anyActionInProgress}
                        onClick={() => {
                          setEditingKey(editingKey === a.attributeKey ? null : a.attributeKey);
                          setEditValue(a.attributeValue ?? '');
                        }}
                      >
                        Ändern
                      </Button>
                      <Button
                        size="sm"
                        icon="check"
                        aria-label="Stimmt"
                        disabled={anyActionInProgress}
                        loading={savingKey === a.attributeKey}
                        onClick={() => confirmAttr(a.attributeKey)}
                      />
                    </div>
                  </div>
                  {editingKey === a.attributeKey && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        aria-label={factLabel(a.attributeKey)}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className={`${inputClass} flex-1 min-w-0`}
                      />
                      <Button
                        disabled={!editValue.trim() || anyActionInProgress}
                        loading={savingKey === a.attributeKey}
                        onClick={() => confirmAttr(a.attributeKey, editValue)}
                      >
                        OK
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Condition picker — always required */}
        <div
          className={`p-4 rounded-card border-2 transition-all ${
            isConditionConfirmed
              ? 'bg-surface border-accent/30'
              : aiConditionMapped
                ? 'bg-accent-soft/30 border-accent/40'
                : 'bg-danger/5 border-danger/30'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <label className="block text-body font-bold text-ink">Wie ist der Zustand?</label>
              {aiConditionMapped && !isConditionConfirmed && (
                <p className={`text-label font-normal mt-0.5 ${isUncertain(aiConditionAttr?.confidence) ? 'text-warning' : 'text-accent'}`}>
                  KI-Vorschlag: <strong>{aiConditionMapped}</strong>
                  {isUncertain(aiConditionAttr?.confidence) ? ' — unsicher, bitte prüfen' : ' — bitte bestätigen'}
                </p>
              )}
            </div>
            {isConditionConfirmed && (
              <span className="inline-flex items-center gap-1 text-label text-accent bg-accent-soft px-2 py-0.5 rounded-full">
                <Icon name="check" size={12} strokeWidth={3} />
                Bestätigt
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Zustand auswählen">
            {CONDITION_OPTIONS.map((cond) => (
              <button
                key={cond}
                type="button"
                role="tab"
                aria-selected={selectedCondition === cond}
                onClick={() => setSelectedCondition(cond)}
                className={`py-2.5 px-1 text-body rounded-control border font-bold transition-all ${
                  selectedCondition === cond
                    ? 'bg-accent border-accent text-accent-ink shadow-card'
                    : cond === aiConditionMapped && !isConditionConfirmed
                      ? 'bg-accent-soft border-accent/30 text-accent'
                      : 'bg-surface border-line text-ink-muted hover:bg-surface-hover'
                }`}
              >
                {cond}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-confirmed summary */}
        {autoConfirmed.length > 0 && (
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer select-none py-1 px-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="text-micro uppercase text-ink-muted">
                {autoConfirmed.length} Attribute automatisch erkannt
              </span>
              <Icon
                name="chevronRight"
                size={14}
                className="ml-auto text-ink-faint rotate-90 group-open:-rotate-90 transition-transform"
              />
            </summary>
            <Card className="mt-2 p-4 grid grid-cols-2 gap-3">
              {autoConfirmed.map((a) => (
                <div key={a.id}>
                  <span className="text-micro uppercase text-ink-faint block">
                    {factLabel(a.attributeKey)}
                  </span>
                  <span className="font-semibold text-ink text-body truncate block">
                    {a.attributeValue}
                  </span>
                </div>
              ))}
            </Card>
          </details>
        )}
        {/* Add more photos + re-analyze — collapsed when only condition remains */}
        {isOneTap ? (
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer select-none py-1 px-1 text-label text-ink-faint list-none">
              <Icon name="chevronRight" size={14} className="group-open:rotate-90 transition-transform" />
              Fotos hinzufügen / neu analysieren
            </summary>
            <div className="mt-2 space-y-2">
              <PhotosAndReanalyze
                newPhotos={newPhotos}
                uploadingPhotos={uploadingPhotos}
                uploadProgress={uploadProgress}
                reanalyzing={reanalyzing}
                anyActionInProgress={anyActionInProgress}
                onNewPhotos={setNewPhotos}
                onUpload={() => void uploadAndReanalyze()}
                onReanalyze={() => void reanalyze()}
                hint={hint}
                onHint={setHint}
              />
            </div>
          </details>
        ) : (
          <PhotosAndReanalyze
            newPhotos={newPhotos}
            uploadingPhotos={uploadingPhotos}
            uploadProgress={uploadProgress}
            reanalyzing={reanalyzing}
            anyActionInProgress={anyActionInProgress}
            onNewPhotos={setNewPhotos}
            onUpload={() => void uploadAndReanalyze()}
            onReanalyze={() => void reanalyze()}
            hint={hint}
            onHint={setHint}
          />
        )}
      </div>

      <ActionBar>
        <Button
          size="lg"
          icon="check"
          loading={saving}
          disabled={!canSave || anyActionInProgress}
          onClick={() => {
            if (!selectedCondition) return;
            void (async () => {
              setSavingKey('drafts');
              setReanalyzeError(null);
              try {
                await flushDrafts();
              } catch (error) {
                setReanalyzeError(errorMessage(error, 'Angaben konnten nicht gespeichert werden'));
                setSavingKey(null);
                return;
              }
              setSavingKey(null);
              await onConfirmCondition(selectedCondition);
            })();
          }}
        >
          {!canSave
            ? 'Bitte Zustand auswählen'
            : isConditionConfirmed
              ? 'Zustand aktualisieren'
              : isOneTap
                ? `Bereit stellen — ${selectedCondition ?? '…'}`
                : `Zustand bestätigen${selectedCondition ? ` — ${selectedCondition}` : ''}`}
        </Button>
      </ActionBar>
    </div>
  );
}

function PhotosAndReanalyze({
  newPhotos,
  uploadingPhotos,
  uploadProgress,
  reanalyzing,
  anyActionInProgress,
  onNewPhotos,
  onUpload,
  onReanalyze,
  hint,
  onHint,
}: {
  newPhotos: File[];
  uploadingPhotos: boolean;
  uploadProgress: number;
  reanalyzing: boolean;
  anyActionInProgress: boolean;
  onNewPhotos: (fn: (prev: File[]) => File[]) => void;
  onUpload: () => void;
  onReanalyze: () => void;
  hint: string;
  onHint: (value: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <label className="flex items-center justify-center gap-2 w-full py-2 border border-dashed border-line rounded-control text-label text-ink-muted hover:bg-surface-hover cursor-pointer transition-colors">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              onNewPhotos((prev) => [...prev, ...files]);
              e.target.value = '';
            }}
          />
          <Icon name="plus" size={15} />
          Fotos hinzufügen
        </label>
        {newPhotos.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-label font-normal text-ink-muted truncate">
              {newPhotos.length} Foto{newPhotos.length !== 1 ? 's' : ''} ausgewählt
            </span>
            <button
              type="button"
              onClick={() => onNewPhotos(() => [])}
              aria-label="Auswahl verwerfen"
              className="text-ink-faint hover:text-danger transition-colors"
            >
              <Icon name="x" size={15} />
            </button>
            <Button
              size="sm"
              loading={uploadingPhotos}
              disabled={uploadingPhotos || anyActionInProgress}
              onClick={onUpload}
            >
              {uploadingPhotos && uploadProgress > 0
                ? `${Math.round(uploadProgress * 100)} %`
                : 'Hochladen & neu analysieren'}
            </Button>
          </div>
        )}
      </div>
      <Field label="Hinweis für die nächste Analyse" hint="Optional, z.B. Marke oder Modell. Was nicht auf dem Foto steht, bleibt unsicher.">
        <input
          value={hint}
          onChange={(event) => onHint(event.target.value)}
          placeholder="z.B. es ist eine Bosch Bohrmaschine"
          aria-label="Hinweis für die KI"
          maxLength={200}
          className={inputClass}
        />
      </Field>
      <Button
        variant="secondary"
        size="sm"
        block
        icon="refresh"
        loading={reanalyzing}
        disabled={reanalyzing || anyActionInProgress}
        onClick={onReanalyze}
      >
        KI-Analyse wiederholen
      </Button>
    </>
  );
}
