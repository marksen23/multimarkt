import { useMemo, useState } from 'react';
import type { ItemDetail } from '../api/types';
import { ActionBar, Button, Card, inputClass } from '../ui';

const CONDITION_OPTIONS = ['Neu', 'Wie neu', 'Gut', 'Gebraucht', 'Defekt'];

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

  const missing = useMemo(
    () => detail.attributes.filter((a) => a.truthState === 'UNKNOWN'),
    [detail.attributes],
  );
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
    <div className="max-w-md mx-auto bg-bg">
      <header className="bg-surface/90 backdrop-blur p-4 border-b border-line sticky top-14 z-10 flex justify-between items-center">
        <h1 className="text-title text-ink">Entwurf prüfen</h1>
        <span className="bg-accent-soft text-accent text-micro uppercase px-2 py-1 rounded-full">
          Confidence Center
        </span>
      </header>

      <div className="p-4 space-y-6">
        <p className="text-body text-ink-muted">
          Die KI hat das Foto analysiert. <strong className="text-ink">Keine Information geht ohne deine Bestätigung online.</strong>
        </p>

        <section className="space-y-3">
          <h2 className="text-micro uppercase text-ink-muted flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-danger" />
            Zwingend erforderlich
          </h2>

          <div
            className={`p-4 rounded-card border-2 transition-all ${
              isConditionConfirmed ? 'bg-surface border-accent/30' : 'bg-danger/5 border-danger/30'
            }`}
          >
            <label className="block text-body font-bold text-ink mb-2">Wie ist der Zustand?</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {CONDITION_OPTIONS.map((cond) => {
                const isSelected = selectedCondition === cond;
                const isConfirmed = isSelected && cond === detail.item.condition;
                return (
                  <button
                    key={cond}
                    type="button"
                    onClick={() => setSelectedCondition(cond)}
                    className={`py-2 px-1 text-label rounded-control border font-bold transition ${
                      isConfirmed
                        ? 'bg-accent border-accent text-accent-ink shadow-card'
                        : isSelected
                          ? 'bg-danger border-danger text-white shadow-card'
                          : 'bg-surface border-line text-ink-muted hover:bg-surface-hover'
                    }`}
                  >
                    {cond}
                  </button>
                );
              })}
            </div>
          </div>

          {missing.map((a) => (
            <div key={a.id} className="bg-danger/5 p-4 rounded-card border border-danger/20 space-y-2">
              <label className="block text-body font-bold text-ink capitalize">
                Welche(s) {a.attributeKey} hat der Artikel?
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={`${a.attributeKey} eingeben…`}
                  value={missingDrafts[a.attributeKey] ?? ''}
                  onChange={(e) =>
                    setMissingDrafts((prev) => ({ ...prev, [a.attributeKey]: e.target.value }))
                  }
                  className={`${inputClass} flex-1 min-w-0`}
                />
                <Button
                  disabled={
                    (anyActionInProgress && savingKey !== a.attributeKey) ||
                    savingKey === a.attributeKey ||
                    !missingDrafts[a.attributeKey]
                  }
                  loading={savingKey === a.attributeKey}
                  onClick={() => confirmAttr(a.attributeKey, missingDrafts[a.attributeKey])}
                >
                  Sichern
                </Button>
              </div>
            </div>
          ))}
        </section>

        {inferred.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-micro uppercase text-ink-muted flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-warning" />
              KI-Vermutungen (Bitte prüfen)
            </h2>
            <div className="bg-warning/5 rounded-card border border-warning/25 divide-y divide-warning/15 overflow-hidden">
              {inferred.map((a) => (
                <div key={a.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-label font-medium text-warning capitalize block">
                        {a.attributeKey}
                      </span>
                      <span className="font-bold text-ink">{a.attributeValue}</span>
                    </div>
                    <div className="flex gap-2">
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
                        disabled={(anyActionInProgress && savingKey !== a.attributeKey) || savingKey === a.attributeKey}
                        loading={savingKey === a.attributeKey}
                        onClick={() => confirmAttr(a.attributeKey)}
                      >
                        Stimmt
                      </Button>
                    </div>
                  </div>
                  {editingKey === a.attributeKey && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className={`${inputClass} flex-1 min-w-0`}
                      />
                      <Button
                        disabled={
                          !editValue ||
                          (anyActionInProgress && savingKey !== a.attributeKey) ||
                          savingKey === a.attributeKey
                        }
                        onClick={() => confirmAttr(a.attributeKey, editValue)}
                      >
                        Speichern
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {confirmed.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-micro uppercase text-ink-muted flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent" />
              Sichere Daten
            </h2>
            <Card className="p-4 grid grid-cols-2 gap-4">
              {confirmed.map((a) => (
                <div key={a.id}>
                  <span className="text-micro uppercase capitalize text-ink-faint">
                    {a.attributeKey}
                  </span>
                  <span className="font-semibold text-ink block text-body truncate">
                    {a.attributeValue}
                  </span>
                </div>
              ))}
            </Card>
          </section>
        )}

        <ActionBar>
          <Button
            size="lg"
            disabled={!canSave || anyActionInProgress}
            onClick={() => selectedCondition && onConfirmCondition(selectedCondition)}
          >
            {saving ? 'Speichert…' : isConditionConfirmed ? 'Zustand aktualisieren' : 'Zustand bestätigen'}
          </Button>
        </ActionBar>
      </div>
    </div>
  );
}
