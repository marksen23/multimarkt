import { useState } from 'react';

interface SuggestedAction {
  id: string;
  label: string;
  variant: 'primary' | 'secondary' | 'danger';
  text: string;
}

const variantStyles: Record<SuggestedAction['variant'], { idle: string; selected: string }> = {
  primary: {
    idle: 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
    selected: 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm',
  },
  secondary: {
    idle: 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
    selected: 'border-gray-500 bg-gray-100 text-gray-800 shadow-sm',
  },
  danger: {
    idle: 'border-red-100 bg-white text-red-700 hover:bg-red-50',
    selected: 'border-red-500 bg-red-50 text-red-800 shadow-sm',
  },
};

interface Props {
  itemTitle: string;
  targetPrice: number;
  minAcceptablePrice: number;
  buyerName: string;
  platform: string;
  incomingMessage: string;
  offeredPrice: number;
  suggestedActions: SuggestedAction[];
}

/**
 * Verhandlungs-Assistent (Zusammenfassung §3-V). Adaptiert aus
 * `docs/verhandlungs_assistent_ui_react.js`.
 *
 * SCOPE-HINWEIS: Doc 04 definiert KEINEN Endpunkt für Käufer-Nachrichten
 * oder KI-gestützte Verhandlungsvorschläge — das ist kein Teil des
 * eingefrorenen API-Vertrags. Diese Komponente bleibt daher bewusst
 * UI-only/Demo mit den vom Aufrufer übergebenen Daten, bis ein
 * entsprechender Backend-Endpunkt bewusst spezifiziert wird (siehe
 * Abschlussbericht) — sie erfindet keine Live-Anbindung vor.
 */
export function NegotiationAssistant({
  itemTitle,
  targetPrice,
  minAcceptablePrice,
  buyerName,
  platform,
  incomingMessage,
  offeredPrice,
  suggestedActions,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  const select = (action: SuggestedAction) => {
    setSelectedId(action.id);
    setReply(action.text);
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(reply);
    window.alert(`Antwort kopiert! Füge sie bei ${platform} ein.`);
  };

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen flex flex-col">
      <header className="bg-white p-4 border-b flex items-center justify-between shadow-sm z-10">
        <div>
          <h1 className="font-bold text-gray-800 text-lg">Chat Assistent</h1>
          <p className="text-xs text-gray-500 line-clamp-1">{itemTitle}</p>
        </div>
        <div className="text-right">
          <span className="block text-xs text-gray-400 uppercase font-bold">Dein Ziel</span>
          <span className="font-bold text-blue-600">{targetPrice} €</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="flex flex-col items-start">
          <span className="text-xs text-gray-500 ml-1 mb-1 font-medium">
            {buyerName} (via {platform})
          </span>
          <div className="bg-white p-4 rounded-2xl rounded-tl-sm shadow-sm border border-gray-100 max-w-[90%]">
            <p className="text-gray-800 text-sm">{incomingMessage}</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-blue-500">✨</span>
            <h3 className="font-bold text-blue-900 text-sm">KI-Einschätzung</h3>
          </div>
          <div className="flex justify-between items-end mb-3">
            <div>
              <span className="block text-[10px] uppercase font-bold text-blue-400">Gebot</span>
              <span className="font-bold text-xl text-red-600">{offeredPrice} €</span>
            </div>
            <div className="text-right">
              <span className="block text-[10px] uppercase font-bold text-blue-400">
                Deine Schmerzgrenze
              </span>
              <span className="font-medium text-sm text-gray-600">{minAcceptablePrice} €</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-bold text-gray-500 uppercase ml-1">Antwort-Strategie wählen</h4>
          <div className="flex flex-col gap-2">
            {suggestedActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => select(action)}
                className={`p-3 text-sm font-semibold rounded-xl border transition-all text-left flex justify-between items-center ${
                  selectedId === action.id
                    ? variantStyles[action.variant].selected
                    : variantStyles[action.variant].idle
                }`}
              >
                {action.label}
                {selectedId === action.id && <span>✓</span>}
              </button>
            ))}
          </div>
        </div>

        {selectedId && (
          <div className="mt-4">
            <h4 className="text-xs font-bold text-gray-500 uppercase ml-1 mb-2">
              Antwort anpassen & senden
            </h4>
            <textarea
              className="w-full bg-white p-4 rounded-xl border border-gray-200 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 resize-none shadow-sm"
              rows={4}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <button
              type="button"
              onClick={copyToClipboard}
              className="w-full mt-3 bg-black text-white font-bold p-4 rounded-xl shadow-lg hover:bg-gray-800 transition active:scale-95"
            >
              Antwort kopieren
            </button>
            <p className="text-[10px] text-gray-400 text-center mt-2">
              Für {platform} muss die Antwort manuell eingefügt werden.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
