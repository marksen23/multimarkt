import { useMemo, useState } from 'react';
import { itemsApi } from '../api/items';
import type { ItemDetail } from '../api/types';
import { RESALE_CATEGORIES, attributeLabel, categoryGaps } from '../category/taxonomy';
import { ActionBar, Button, Card, Icon, Notice, inputClass } from '../ui';

const CONDITION_OPTIONS = ['Neu', 'Wie neu', 'Gut', 'Gebraucht', 'Defekt'];

// Maps AI condition values (English enum from Gemini prompt) to display labels
const CONDITION_MAP: Record<string, string> = {
  new: 'Neu',
  like_new: 'Wie neu',
  good: 'Gut',
  fair: 'Gebraucht',
  defective: 'Defekt',
};

const KEY_LABELS: Record<string, string> = {
  category: 'Kategorie',
  color: 'Farbe',
  brand: 'Marke',
  material: 'Material',
  condition: 'Zustand',
  size: 'Größe',
  measurements: 'Maße',
  functionChecked: 'Funktion geprüft',
  categoryDetail: 'Artikelart',
  notable_features: 'Besonderheiten',
  visible_defects: 'Sichtbare Mängel',
};

const TAXONOMY_KEYS = new Set(['category', 'size', 'measurements', 'brand', 'functionChecked']);

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

  const reanalyze = async () => {
    setReanalyzing(true);
    setReanalyzeError(null);
    try {
      await itemsApi.reanalyze(detail.item.id);
      onReload();
    } catch {
      setReanalyzeError('Re-Analyse fehlgeschlagen — bitte erneut versuchen');
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
      await itemsApi.uploadMorePhotos(detail.item.id, newPhotos, (f) => setUploadProgress(f));
      setNewPhotos([]);
      onReload();
    } catch {
      setReanalyzeError('Foto-Upload fehlgeschlagen — bitte erneut versuchen');
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
        (a) => a.truthState === 'UNKNOWN' && !TAXONOMY_KEYS.has(a.attributeKey) && !gapKeys.includes(a.attributeKey),
      ),
    [nonConditionAttrs, gapKeys],
  );
  const missingCount = gapKeys.length + extraMissing.length;
  const inferred = useMemo(
    () => nonConditionAttrs.filter((a) => a.truthState === 'INFERRED'),
    [nonConditionAttrs],
  );
  const autoConfirmed = useMemo(
    () => detail.attributes.filter((a) => a.truthState === 'USER_CONFIRMED' && a.attributeKey !== 'condition'),
    [detail.attributes],
  );

  const totalQuestions = missingCount + inferred.length + 1; // +1 for condition
  const answeredQuestions =
    (selectedCondition !== null ? 1 : 0) +
    inferred.filter((a) => a.truthState === 'USER_CONFIRMED').length;
  const isConditionConfirmed = detail.item.condition !== null;
  const canSave = selectedCondition !== null;
  const anyActionInProgress = saving || savingKey !== null;

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

        {gapKeys.map((key) => (
          <div key={key} className="bg-danger/5 p-4 rounded-card border border-danger/20 space-y-2">
            <label className="block text-body font-bold text-ink">
              {key === 'category'
                ? 'Welche Kategorie passt?'
                : key === 'functionChecked'
                  ? 'Funktioniert der Artikel?'
                  : `${KEY_LABELS[key] ?? attributeLabel(key)}?`}
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
                    aria-label={KEY_LABELS[key] ?? attributeLabel(key)}
                    placeholder={`${KEY_LABELS[key] ?? attributeLabel(key)} eingeben…`}
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
                  {KEY_LABELS[a.attributeKey] ?? a.attributeKey}?
                </label>
                <p className="text-label font-normal text-ink-muted mt-0.5">
                  Auf dem Foto nicht erkennbar — bitte ergänzen
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                aria-label={KEY_LABELS[a.attributeKey] ?? a.attributeKey}
                placeholder={`${KEY_LABELS[a.attributeKey] ?? a.attributeKey} eingeben…`}
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
                <div key={a.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-micro uppercase capitalize text-ink-faint block">
                        {KEY_LABELS[a.attributeKey] ?? a.attributeKey}
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
                        aria-label={KEY_LABELS[a.attributeKey] ?? a.attributeKey}
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
                <p className="text-label font-normal text-accent mt-0.5">
                  KI-Vorschlag: <strong>{aiConditionMapped}</strong> — bitte bestätigen
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
          <div className="grid grid-cols-3 gap-2" role="tablist">
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
                    {KEY_LABELS[a.attributeKey] ?? a.attributeKey}
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
          />
        )}
      </div>

      <ActionBar>
        <Button
          size="lg"
          icon="check"
          loading={saving}
          disabled={!canSave || anyActionInProgress}
          onClick={() => selectedCondition && onConfirmCondition(selectedCondition)}
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
}: {
  newPhotos: File[];
  uploadingPhotos: boolean;
  uploadProgress: number;
  reanalyzing: boolean;
  anyActionInProgress: boolean;
  onNewPhotos: (fn: (prev: File[]) => File[]) => void;
  onUpload: () => void;
  onReanalyze: () => void;
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
