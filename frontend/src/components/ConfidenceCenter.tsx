import { useMemo, useState } from 'react';
import type { ItemDetail } from '../api/types';

const CONDITION_OPTIONS = ['Neu', 'Wie neu', 'Gut', 'Gebraucht', 'Defekt'];

interface Props {
  detail: ItemDetail;
  onConfirmCondition: (condition: string) => Promise<void>;
  saving: boolean;
}

/**
 * Confidence Center (Freeze §7 Stufe 1, "Never silently invent"). Angepasst
 * aus `docs/confidence_center_ui_react.md`, aber an das reale Backend
 * angebunden statt an Mock-Daten.
 *
 * WICHTIG (siehe Abschlussbericht): Doc 04 definiert nur EINEN
 * Bestätigungs-Endpunkt (`POST /items/:id/confirm-truth` für `condition`).
 * Es gibt keinen Endpunkt, um einzelne KI-Claims (Marke, Farbe, ...)
 * individuell zu bestätigen — dieser Vertrag müsste um z.B.
 * `POST /items/:id/attributes/:key/confirm` erweitert werden. Bis dahin
 * zeigt diese Komponente INFERRED-Attribute bewusst nur LESEND an (echte
 * Transparenz statt vorgetäuschter Interaktivität).
 */
export function ConfidenceCenter({ detail, onConfirmCondition, saving }: Props) {
  const [selectedCondition, setSelectedCondition] = useState<string | null>(detail.item.condition);

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

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen pb-24">
      <header className="bg-white p-4 border-b sticky top-0 z-10 flex justify-between items-center shadow-sm">
        <h1 className="font-bold text-gray-800 text-lg">Entwurf prüfen</h1>
        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-semibold uppercase tracking-wide">
          Confidence Center
        </span>
      </header>

      <div className="p-4 space-y-6">
        <p className="text-sm text-gray-600">
          Die KI hat das Foto analysiert. <strong>Keine Information geht ohne deine Bestätigung online.</strong>
        </p>

        <section className="space-y-3">
          <h2 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Zwingend erforderlich
          </h2>

          <div
            className={`p-4 rounded-xl border-2 transition-all ${
              isConditionConfirmed ? 'bg-white border-green-200' : 'bg-red-50 border-red-200'
            }`}
          >
            <label className="block text-sm font-bold text-gray-800 mb-2">Wie ist der Zustand?</label>
            <div className="grid grid-cols-3 gap-2">
              {CONDITION_OPTIONS.map((cond) => (
                <button
                  key={cond}
                  type="button"
                  onClick={() => setSelectedCondition(cond)}
                  className={`py-2 px-1 text-xs rounded-lg border font-bold transition ${
                    selectedCondition === cond
                      ? 'bg-red-600 border-red-600 text-white shadow-md'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {cond}
                </button>
              ))}
            </div>
          </div>

          {missing.length > 0 && (
            <div className="bg-red-50 p-4 rounded-xl border border-red-100">
              <p className="text-sm font-bold text-gray-800 mb-1">
                {missing.length} weitere Angabe(n) fehlen
              </p>
              <ul className="text-xs text-gray-600 list-disc list-inside">
                {missing.map((a) => (
                  <li key={a.id} className="capitalize">
                    {a.attributeKey}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {inferred.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              KI-Vermutungen
            </h2>
            <div className="bg-yellow-50 rounded-xl border border-yellow-200 divide-y divide-yellow-100 overflow-hidden">
              {inferred.map((a) => (
                <div key={a.id} className="p-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-yellow-800 capitalize font-medium block">
                      {a.attributeKey}
                    </span>
                    <span className="font-bold text-gray-800">{a.attributeValue}</span>
                  </div>
                  <span className="text-[10px] text-yellow-700 uppercase font-bold">Vorschlag</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {confirmed.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Sichere Daten
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 gap-4">
              {confirmed.map((a) => (
                <div key={a.id}>
                  <span className="text-[10px] text-gray-400 uppercase font-bold capitalize">
                    {a.attributeKey}
                  </span>
                  <span className="font-semibold text-gray-800 block text-sm truncate">
                    {a.attributeValue}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent">
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={() => selectedCondition && onConfirmCondition(selectedCondition)}
          className={`w-full p-4 rounded-xl font-bold flex items-center justify-center transition-all ${
            canSave && !saving
              ? 'bg-black text-white shadow-xl hover:bg-gray-800'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {saving ? 'Speichert…' : isConditionConfirmed ? 'Zustand aktualisieren' : 'Zustand bestätigen'}
        </button>
      </div>
    </div>
  );
}
