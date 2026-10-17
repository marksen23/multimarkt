import { useMemo, useState } from 'react';
import type { ItemDetail } from '../api/types';
import {
  attributeLabel,
  categoryGaps,
  displayAttributeValue,
  RESALE_CATEGORIES,
} from '../category/taxonomy';

const CONDITION_OPTIONS = ['Neu', 'Wie neu', 'Gut', 'Gebraucht', 'Defekt'];

const GAP_PROMPTS: Record<string, string> = {
  category: 'Welche Kategorie passt?',
  size: 'Welche Größe hat der Artikel?',
  measurements: 'Welche Maße hat der Artikel?',
  brand: 'Welche Marke hat der Artikel?',
  functionChecked: 'Funktioniert der Artikel?',
};

const GAP_PLACEHOLDERS: Record<string, string> = {
  size: 'z.B. M oder 42',
  measurements: 'z.B. 80 × 40 × 30 cm',
  brand: 'Marke eingeben…',
};

interface Props {
  detail: ItemDetail;
  onConfirmCondition: (condition: string) => Promise<void>;
  onConfirmAttribute: (key: string, value?: string) => Promise<void>;
  saving: boolean;
}

/**
 * Confidence Center (Freeze §7 Stufe 1, "Never silently invent"). Angepasst
 * aus `docs/confidence_center_ui_react.md`, an das reale Backend angebunden.
 *
 * `condition` läuft über `confirm-truth` (löst zusätzlich die
 * REVIEW_REQUIRED->READY-Transition aus). Alle anderen Attribute laufen
 * über `POST /items/:id/attributes/:key/confirm` — eine bewusste,
 * dokumentierte Doc-04-Erweiterung (siehe items.controller.ts), ohne die
 * "Stimmt"/"Ändern"-Interaktion aus dem ursprünglichen Mockup nur
 * vorgetäuscht wäre.
 *
 * Feature-Plan 3.9: gefragt werden nur die Lücken der Kategorie
 * (Größe, Maße, Marke, Funktion geprüft — jeweils nur, was die
 * Kategorie braucht). Die Bildanalyse füllt den Rest nur, wenn sie
 * ihn gesehen hat.
 */
export function ConfidenceCenter({
  detail,
  onConfirmCondition,
  onConfirmAttribute,
  saving,
}: Props) {
  const [selectedCondition, setSelectedCondition] = useState<string | null>(detail.item.condition);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [missingDrafts, setMissingDrafts] = useState<Record<string, string>>({});

  const gaps = useMemo(() => categoryGaps(detail.attributes), [detail.attributes]);
  const inferred = useMemo(
    () => detail.attributes.filter((a) => a.truthState === 'INFERRED'),
    [detail.attributes],
  );
  const confirmed = useMemo(
    () => detail.attributes.filter((a) => a.truthState === 'USER_CONFIRMED'),
    [detail.attributes],
  );

  const isConditionConfirmed = detail.item.condition !== null;
  const canSave = selectedCondition !== null && selectedCondition !== detail.item.condition;
  // Verhindert, dass während eines laufenden Speicherns (lokal `savingKey`
  // ODER die seitenweite `saving`-Reload-Phase aus ItemDetailPage.run())
  // eine zweite, konkurrierende Mutation gestartet wird — ohne diese Sperre
  // konnte ein Doppelklick über verschiedene Attribute hinweg `savingKey`
  // überschreiben und den Spinner/Disabled-Zustand des ersten Requests
  // verlieren, obwohl der noch lief.
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

  return (
    <div className="max-w-md mx-auto bg-bg min-h-screen pb-24">
      <header className="bg-surface/90 backdrop-blur p-4 border-b border-line sticky top-0 z-10 flex justify-between items-center">
        <h1 className="font-bold text-ink text-lg">Entwurf prüfen</h1>
        <span className="bg-accent-soft text-accent text-xs px-2 py-1 rounded-full font-semibold uppercase tracking-wide">
          Confidence Center
        </span>
      </header>

      <div className="p-4 space-y-6">
        <p className="text-sm text-ink-muted">
          Die KI hat nur eingetragen, was auf dem Foto zu sehen ist.{' '}
          <strong className="text-ink">Pflichtangaben hängen an der Kategorie — Lücken fragst du hier.</strong>
        </p>

        <section className="space-y-3">
          <h2 className="text-xs font-bold text-ink-muted uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Zwingend erforderlich
          </h2>

          <div
            className={`p-4 rounded-2xl border-2 transition-all ${
              isConditionConfirmed ? 'bg-surface border-accent/30' : 'bg-red-500/5 border-red-500/30'
            }`}
          >
            <label className="block text-sm font-bold text-ink mb-2">Wie ist der Zustand?</label>
            <div className="grid grid-cols-3 gap-2">
              {CONDITION_OPTIONS.map((cond) => (
                <button
                  key={cond}
                  type="button"
                  onClick={() => setSelectedCondition(cond)}
                  className={`py-2 px-1 text-xs rounded-lg border font-bold transition ${
                    selectedCondition === cond
                      ? 'bg-red-600 border-red-600 text-white shadow-md'
                      : 'bg-surface border-line text-ink-muted hover:bg-surface-hover'
                  }`}
                >
                  {cond}
                </button>
              ))}
            </div>
          </div>

          {gaps.map((key) => (
            <div key={key} className="bg-red-500/5 p-4 rounded-2xl border border-red-500/20 space-y-2">
              <label className="block text-sm font-bold text-ink">{GAP_PROMPTS[key] ?? attributeLabel(key)}</label>
              {key === 'functionChecked' ? (
                <div className="grid grid-cols-2 gap-2">
                  {(['ja', 'nein'] as const).map((answer) => (
                    <button
                      key={answer}
                      type="button"
                      disabled={anyActionInProgress}
                      onClick={() => confirmAttr(key, answer)}
                      className="py-2 rounded-lg border border-red-500/30 bg-surface text-sm font-bold text-ink hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {savingKey === key ? '…' : answer === 'ja' ? 'Ja' : 'Nein'}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-2">
                  {key === 'category' ? (
                    <select
                      value={missingDrafts.category ?? ''}
                      onChange={(e) => setMissingDrafts((prev) => ({ ...prev, category: e.target.value }))}
                      className="flex-1 p-2 border border-red-500/30 rounded-lg text-sm bg-surface text-ink outline-none focus:border-red-500"
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
                      placeholder={GAP_PLACEHOLDERS[key] ?? `${attributeLabel(key)} eingeben…`}
                      value={missingDrafts[key] ?? ''}
                      onChange={(e) => setMissingDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="flex-1 p-2 border border-red-500/30 rounded-lg text-sm outline-none focus:border-red-500"
                    />
                  )}
                  <button
                    type="button"
                    disabled={
                      (anyActionInProgress && savingKey !== key) || savingKey === key || !missingDrafts[key]
                    }
                    onClick={() => confirmAttr(key, missingDrafts[key])}
                    className="px-3 py-2 bg-red-600 text-white rounded-lg font-bold text-xs disabled:bg-line disabled:text-ink-faint"
                  >
                    {savingKey === key ? '…' : 'Sichern'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>

        {inferred.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold text-ink-muted uppercase flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              KI-Vermutungen (Bitte prüfen)
            </h2>
            <div className="bg-yellow-500/5 rounded-2xl border border-yellow-500/25 divide-y divide-yellow-500/15 overflow-hidden">
              {inferred.map((a) => (
                <div key={a.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-yellow-700 dark:text-yellow-500 font-medium block">
                        {attributeLabel(a.attributeKey)}
                      </span>
                      <span className="font-bold text-ink">{displayAttributeValue(a.attributeKey, a.attributeValue)}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={anyActionInProgress}
                        onClick={() => {
                          setEditingKey(editingKey === a.attributeKey ? null : a.attributeKey);
                          setEditValue(a.attributeValue ?? '');
                        }}
                        className="p-2 bg-surface rounded-lg border border-yellow-500/25 text-ink-muted hover:bg-surface-hover text-xs font-bold disabled:opacity-50"
                      >
                        Ändern
                      </button>
                      <button
                        type="button"
                        disabled={(anyActionInProgress && savingKey !== a.attributeKey) || savingKey === a.attributeKey}
                        onClick={() => confirmAttr(a.attributeKey)}
                        className="px-3 py-2 bg-yellow-400 text-yellow-900 rounded-lg font-bold text-sm shadow-sm hover:bg-yellow-500 disabled:opacity-50"
                      >
                        {savingKey === a.attributeKey ? '…' : 'Stimmt'}
                      </button>
                    </div>
                  </div>
                  {editingKey === a.attributeKey && (
                    <div className="flex gap-2">
                      {a.attributeKey === 'category' ? (
                        <select
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 p-2 border border-yellow-500/25 rounded-lg text-sm bg-surface text-ink outline-none focus:border-yellow-500"
                        >
                          <option value="">Kategorie wählen…</option>
                          {RESALE_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      ) : a.attributeKey === 'functionChecked' ? (
                        <select
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 p-2 border border-yellow-500/25 rounded-lg text-sm bg-surface text-ink outline-none focus:border-yellow-500"
                        >
                          <option value="">Bitte wählen…</option>
                          <option value="ja">Ja</option>
                          <option value="nein">Nein</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 p-2 border border-yellow-500/25 rounded-lg text-sm outline-none focus:border-yellow-500"
                        />
                      )}
                      <button
                        type="button"
                        disabled={
                          !editValue ||
                          (anyActionInProgress && savingKey !== a.attributeKey) ||
                          savingKey === a.attributeKey
                        }
                        onClick={() => confirmAttr(a.attributeKey, editValue)}
                        className="px-3 py-2 bg-yellow-500 text-white rounded-lg font-bold text-xs disabled:opacity-50"
                      >
                        Speichern
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {confirmed.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold text-ink-muted uppercase flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent" />
              Sichere Daten
            </h2>
            <div className="bg-surface rounded-2xl border border-line p-4 grid grid-cols-2 gap-4">
              {confirmed.map((a) => (
                <div key={a.id}>
                  <span className="text-[10px] text-ink-faint uppercase font-bold">
                    {attributeLabel(a.attributeKey)}
                  </span>
                  <span className="font-semibold text-ink block text-sm truncate">
                    {displayAttributeValue(a.attributeKey, a.attributeValue)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-bg via-bg to-transparent">
        <button
          type="button"
          disabled={!canSave || anyActionInProgress}
          onClick={() => selectedCondition && onConfirmCondition(selectedCondition)}
          className={`w-full p-4 rounded-xl font-bold flex items-center justify-center transition-all ${
            canSave && !anyActionInProgress
              ? 'bg-accent text-accent-ink shadow-xl hover:bg-accent-hover'
              : 'bg-line text-ink-faint cursor-not-allowed'
          }`}
        >
          {saving ? 'Speichert…' : isConditionConfirmed ? 'Zustand aktualisieren' : 'Zustand bestätigen'}
        </button>
      </div>
    </div>
  );
}
