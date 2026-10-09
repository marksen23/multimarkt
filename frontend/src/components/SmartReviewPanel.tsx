import { useMemo, useState } from 'react';
import { itemsApi } from '../api/items';
import type { ItemDetail } from '../api/types';

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
  notable_features: 'Besonderheiten',
  visible_defects: 'Sichtbare Mängel',
};

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

  const missing = useMemo(
    () => nonConditionAttrs.filter((a) => a.truthState === 'UNKNOWN'),
    [nonConditionAttrs],
  );
  const inferred = useMemo(
    () => nonConditionAttrs.filter((a) => a.truthState === 'INFERRED'),
    [nonConditionAttrs],
  );
  const autoConfirmed = useMemo(
    () => detail.attributes.filter((a) => a.truthState === 'USER_CONFIRMED' && a.attributeKey !== 'condition'),
    [detail.attributes],
  );

  const totalQuestions = missing.length + inferred.length + 1; // +1 for condition
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
  const isOneTap = missing.length === 0 && inferred.length === 0;

  return (
    <div className="max-w-md mx-auto bg-bg min-h-screen pb-28">
      <header className="bg-surface/90 backdrop-blur p-4 border-b border-line sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-ink text-base leading-tight">
              {isOneTap ? 'Fast fertig!' : 'Kurze Fragen'}
            </h1>
            <p className="text-xs text-ink-muted mt-0.5">
              {isOneTap
                ? 'KI hat alles erkannt — nur Zustand bestätigen'
                : `${missing.length + inferred.length + 1} Angabe${missing.length + inferred.length + 1 !== 1 ? 'n' : ''} nötig`}
            </p>
          </div>
          {autoConfirmed.length > 0 && (
            <span className="text-xs bg-accent-soft text-accent px-2 py-1 rounded-full font-bold">
              {autoConfirmed.length} auto ✓
            </span>
          )}
        </div>
        {reanalyzeError && (
          <p className="text-xs text-danger mt-1">{reanalyzeError}</p>
        )}
        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-line rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-300"
            style={{
              width: `${totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0}%`,
            }}
          />
        </div>
      </header>

      <div className="p-4 space-y-4">

        {/* UNKNOWN attributes — required, AI had no answer */}
        {missing.map((a) => (
          <div key={a.id} className="bg-red-500/5 p-4 rounded-2xl border border-red-500/20 space-y-2">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              </span>
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-bold text-ink">
                  {KEY_LABELS[a.attributeKey] ?? a.attributeKey}?
                </label>
                <p className="text-xs text-ink-muted mt-0.5">
                  Auf dem Foto nicht erkennbar — bitte ergänzen
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={`${KEY_LABELS[a.attributeKey] ?? a.attributeKey} eingeben…`}
                value={missingDrafts[a.attributeKey] ?? ''}
                onChange={(e) =>
                  setMissingDrafts((prev) => ({ ...prev, [a.attributeKey]: e.target.value }))
                }
                className="flex-1 p-2.5 border border-red-500/30 rounded-xl text-sm outline-none focus:border-red-500 bg-surface"
              />
              <button
                type="button"
                disabled={
                  anyActionInProgress ||
                  !missingDrafts[a.attributeKey]?.trim()
                }
                onClick={() => confirmAttr(a.attributeKey, missingDrafts[a.attributeKey])}
                className="px-4 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm disabled:bg-line disabled:text-ink-faint transition-colors"
              >
                {savingKey === a.attributeKey ? '…' : 'OK'}
              </button>
            </div>
          </div>
        ))}

        {/* INFERRED attributes — AI guessed, needs confirmation */}
        {inferred.length > 0 && (
          <div className="bg-surface rounded-2xl border border-line overflow-hidden">
            <div className="px-4 py-2.5 bg-yellow-500/5 border-b border-yellow-500/20 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
              <span className="text-xs font-bold text-yellow-700 dark:text-yellow-500 uppercase tracking-wide">
                KI-Vorschläge — bitte prüfen
              </span>
            </div>
            <div className="divide-y divide-line">
              {inferred.map((a) => (
                <div key={a.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[11px] text-ink-faint uppercase font-bold capitalize block">
                        {KEY_LABELS[a.attributeKey] ?? a.attributeKey}
                      </span>
                      <span className="font-semibold text-ink text-sm truncate block">
                        {a.attributeValue}
                      </span>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={anyActionInProgress}
                        onClick={() => {
                          setEditingKey(editingKey === a.attributeKey ? null : a.attributeKey);
                          setEditValue(a.attributeValue ?? '');
                        }}
                        className="px-2.5 py-1.5 border border-line rounded-lg text-xs font-bold text-ink-muted hover:bg-surface-hover disabled:opacity-50 transition-colors"
                      >
                        Ändern
                      </button>
                      <button
                        type="button"
                        disabled={anyActionInProgress}
                        onClick={() => confirmAttr(a.attributeKey)}
                        className="px-3 py-1.5 bg-yellow-400 text-yellow-900 rounded-lg font-bold text-sm hover:bg-yellow-500 disabled:opacity-50 transition-colors"
                      >
                        {savingKey === a.attributeKey ? '…' : '✓'}
                      </button>
                    </div>
                  </div>
                  {editingKey === a.attributeKey && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 p-2 border border-yellow-500/30 rounded-lg text-sm outline-none focus:border-yellow-500 bg-surface"
                      />
                      <button
                        type="button"
                        disabled={!editValue.trim() || anyActionInProgress}
                        onClick={() => confirmAttr(a.attributeKey, editValue)}
                        className="px-3 py-2 bg-yellow-500 text-white rounded-lg font-bold text-xs disabled:opacity-50"
                      >
                        {savingKey === a.attributeKey ? '…' : 'OK'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Condition picker — always required */}
        <div
          className={`p-4 rounded-2xl border-2 transition-all ${
            isConditionConfirmed
              ? 'bg-surface border-accent/30'
              : aiConditionMapped
                ? 'bg-accent-soft/30 border-accent/40'
                : 'bg-red-500/5 border-red-500/30'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <label className="block text-sm font-bold text-ink">Wie ist der Zustand?</label>
              {aiConditionMapped && !isConditionConfirmed && (
                <p className="text-xs text-accent mt-0.5">
                  KI-Vorschlag: <strong>{aiConditionMapped}</strong> — bitte bestätigen
                </p>
              )}
            </div>
            {isConditionConfirmed && (
              <span className="text-xs font-bold text-accent bg-accent-soft px-2 py-0.5 rounded-full">
                ✓ Bestätigt
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {CONDITION_OPTIONS.map((cond) => (
              <button
                key={cond}
                type="button"
                onClick={() => setSelectedCondition(cond)}
                className={`py-2.5 px-1 text-sm rounded-xl border font-bold transition-all ${
                  selectedCondition === cond
                    ? 'bg-accent border-accent text-accent-ink shadow-sm'
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
              <span className="text-xs font-bold text-ink-muted uppercase tracking-wide">
                {autoConfirmed.length} Attribute automatisch erkannt
              </span>
              <span className="ml-auto text-ink-faint text-xs group-open:hidden">▼</span>
              <span className="ml-auto text-ink-faint text-xs hidden group-open:inline">▲</span>
            </summary>
            <div className="mt-2 bg-surface rounded-2xl border border-line p-4 grid grid-cols-2 gap-3">
              {autoConfirmed.map((a) => (
                <div key={a.id}>
                  <span className="text-[10px] text-ink-faint uppercase font-bold block">
                    {KEY_LABELS[a.attributeKey] ?? a.attributeKey}
                  </span>
                  <span className="font-semibold text-ink text-sm truncate block">
                    {a.attributeValue}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
        {/* Add more photos + re-analyze — collapsed when only condition remains */}
        {isOneTap ? (
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer select-none py-1 px-1 text-xs font-bold text-ink-faint list-none">
              <span className="group-open:hidden">▶</span>
              <span className="hidden group-open:inline">▼</span>
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

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-bg via-bg/95 to-transparent">
        <button
          type="button"
          disabled={!canSave || anyActionInProgress}
          onClick={() => selectedCondition && onConfirmCondition(selectedCondition)}
          className={`w-full p-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all ${
            canSave && !anyActionInProgress
              ? 'bg-accent text-accent-ink shadow-lg hover:bg-accent-hover active:scale-[0.98]'
              : 'bg-line text-ink-faint cursor-not-allowed'
          }`}
        >
          {saving
            ? 'Speichert…'
            : isConditionConfirmed
              ? 'Zustand aktualisieren'
              : isOneTap
                ? `Bereit stellen — ${selectedCondition ?? '…'}`
                : `Zustand bestätigen${selectedCondition ? ` — ${selectedCondition}` : ''}`}
        </button>
        {!canSave && (
          <p className="text-center text-xs text-ink-faint mt-2">
            Bitte Zustand auswählen
          </p>
        )}
      </div>
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
        <label className="flex items-center justify-center gap-2 w-full py-2 border border-dashed border-line rounded-xl text-xs font-bold text-ink-muted hover:bg-surface-hover cursor-pointer transition-colors">
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
          + Fotos hinzufügen
        </label>
        {newPhotos.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs text-ink-muted truncate">
              {newPhotos.length} Foto{newPhotos.length !== 1 ? 's' : ''} ausgewählt
            </span>
            <button
              type="button"
              onClick={() => onNewPhotos(() => [])}
              className="text-xs text-ink-faint hover:text-danger transition-colors"
            >
              ✕
            </button>
            <button
              type="button"
              disabled={uploadingPhotos || anyActionInProgress}
              onClick={onUpload}
              className="px-3 py-1.5 bg-accent text-accent-ink rounded-lg text-xs font-bold disabled:opacity-50 transition-colors"
            >
              {uploadingPhotos
                ? uploadProgress > 0
                  ? `${Math.round(uploadProgress * 100)}%`
                  : 'Lädt hoch…'
                : 'Hochladen & neu analysieren'}
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        disabled={reanalyzing || anyActionInProgress}
        onClick={onReanalyze}
        className="w-full py-2 border border-line rounded-xl text-xs font-bold text-ink-muted hover:bg-surface-hover disabled:opacity-50 transition-colors"
      >
        {reanalyzing ? 'KI analysiert neu…' : '↺ KI-Analyse wiederholen'}
      </button>
    </>
  );
}
