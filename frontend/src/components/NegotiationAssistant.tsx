import { useState } from 'react';

interface SuggestedAction {
  id: string;
  label: string;
  variant: 'primary' | 'secondary' | 'danger';
  text: string;
}

const variantStyles: Record<SuggestedAction['variant'], { idle: string; selected: string }> = {
  primary: {
    idle: 'border-line bg-surface text-ink-muted hover:bg-surface-hover',
    selected: 'border-accent bg-accent-soft text-accent shadow-sm',
  },
  secondary: {
    idle: 'border-line bg-surface text-ink-muted hover:bg-surface-hover',
    selected: 'border-ink-faint bg-surface-hover text-ink shadow-sm',
  },
  danger: {
    idle: 'border-red-500/20 bg-surface text-red-600 dark:text-red-400 hover:bg-red-500/5',
    selected: 'border-red-500 bg-red-500/5 text-red-700 dark:text-red-400 shadow-sm',
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
    try {
      await navigator.clipboard.writeText(reply);
      window.alert(`Antwort kopiert! Füge sie bei ${platform} ein.`);
    } catch {
      // Clipboard-API kann aus vielen Gründen scheitern (fehlende
      // Berechtigung, kein sicherer Kontext, iframe-Policy) — ohne diesen
      // Fallback wäre der einzige Button der Seite lautlos wirkungslos.
      window.alert('Kopieren nicht möglich — markiere den Text oben und kopiere ihn manuell.');
    }
  };

  return (
    <div className="max-w-md mx-auto bg-bg min-h-screen flex flex-col">
      <header className="bg-surface/90 backdrop-blur p-4 border-b border-line flex items-center justify-between z-10">
        <div>
          <h1 className="font-bold text-ink text-lg">Chat Assistent</h1>
          <p className="text-xs text-ink-muted line-clamp-1">{itemTitle}</p>
        </div>
        <div className="text-right">
          <span className="block text-xs text-ink-faint uppercase font-bold">Dein Ziel</span>
          <span className="font-bold text-accent">{targetPrice} €</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="flex flex-col items-start">
          <span className="text-xs text-ink-muted ml-1 mb-1 font-medium">
            {buyerName} (via {platform})
          </span>
          <div className="bg-surface p-4 rounded-2xl rounded-tl-sm shadow-sm border border-line max-w-[90%]">
            <p className="text-ink text-sm">{incomingMessage}</p>
          </div>
        </div>

        <div className="bg-accent-soft border border-accent/20 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-accent">✨</span>
            <h3 className="font-bold text-accent text-sm">KI-Einschätzung</h3>
          </div>
          <div className="flex justify-between items-end mb-3">
            <div>
              <span className="block text-[10px] uppercase font-bold text-accent/70">Gebot</span>
              <span className="font-bold text-xl text-red-600 dark:text-red-400">{offeredPrice} €</span>
            </div>
            <div className="text-right">
              <span className="block text-[10px] uppercase font-bold text-accent/70">
                Deine Schmerzgrenze
              </span>
              <span className="font-medium text-sm text-ink-muted">{minAcceptablePrice} €</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-bold text-ink-muted uppercase ml-1">Antwort-Strategie wählen</h4>
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
            <h4 className="text-xs font-bold text-ink-muted uppercase ml-1 mb-2">
              Antwort anpassen & senden
            </h4>
            <textarea
              className="w-full bg-surface p-4 rounded-xl border border-line text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft resize-none shadow-sm transition"
              rows={4}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <button
              type="button"
              onClick={copyToClipboard}
              className="w-full mt-3 bg-accent text-accent-ink font-bold p-4 rounded-xl shadow-lg hover:bg-accent-hover transition active:scale-95"
            >
              Antwort kopieren
            </button>
            <p className="text-[10px] text-ink-faint text-center mt-2">
              Für {platform} muss die Antwort manuell eingefügt werden.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
