import { useState } from 'react';
import { copyText } from '../lib/clipboard';
import { useToast } from './Toast';
import { Button, Icon, inputClass } from '../ui';

interface SuggestedAction {
  id: string;
  label: string;
  variant: 'primary' | 'secondary' | 'danger';
  text: string;
}

const variantStyles: Record<SuggestedAction['variant'], { idle: string; selected: string }> = {
  primary: {
    idle: 'border-line bg-surface text-ink-muted hover:bg-surface-hover',
    selected: 'border-accent bg-accent-soft text-accent shadow-card',
  },
  secondary: {
    idle: 'border-line bg-surface text-ink-muted hover:bg-surface-hover',
    selected: 'border-ink-faint bg-surface-hover text-ink shadow-card',
  },
  danger: {
    idle: 'border-danger/20 bg-surface text-danger hover:bg-danger/5',
    selected: 'border-danger bg-danger-soft text-danger shadow-card',
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
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  const select = (action: SuggestedAction) => {
    setSelectedId(action.id);
    setReply(action.text);
  };

  const copyToClipboard = async () => {
    try {
      await copyText(reply);
      toast(`Kopiert — bei ${platform} einfügen.`, 'success');
    } catch {
      toast('Kopieren nicht möglich — Text oben manuell markieren und kopieren.', 'error');
    }
  };

  return (
    <div className="max-w-md mx-auto bg-bg min-h-screen flex flex-col">
      <header className="bg-surface/90 backdrop-blur p-4 border-b border-line flex items-center justify-between z-10">
        <div>
          <h1 className="text-title text-ink">Chat Assistent</h1>
          <p className="text-label font-normal text-ink-muted line-clamp-1">{itemTitle}</p>
        </div>
        <div className="text-right">
          <span className="block text-micro uppercase text-ink-faint">Dein Ziel</span>
          <span className="font-bold text-accent tabular-nums">{targetPrice} €</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="flex flex-col items-start">
          <span className="text-label font-medium text-ink-muted ml-1 mb-1">
            {buyerName} (via {platform})
          </span>
          <div className="bg-surface p-4 rounded-card rounded-tl-sm shadow-card border border-line max-w-[90%]">
            <p className="text-ink text-body">{incomingMessage}</p>
          </div>
        </div>

        <div className="bg-accent-soft border border-accent/20 rounded-card p-4 shadow-card">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="sparkle" size={16} className="text-accent" />
            <h3 className="font-bold text-accent text-body">KI-Einschätzung</h3>
          </div>
          <div className="flex justify-between items-end mb-3">
            <div>
              <span className="block text-micro uppercase text-accent/70">Gebot</span>
              <span className="text-display text-danger tabular-nums">{offeredPrice} €</span>
            </div>
            <div className="text-right">
              <span className="block text-micro uppercase text-accent/70">
                Deine Schmerzgrenze
              </span>
              <span className="font-medium text-body text-ink-muted tabular-nums">{minAcceptablePrice} €</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-micro uppercase text-ink-muted ml-1">Antwort-Strategie wählen</h4>
          <div className="flex flex-col gap-2">
            {suggestedActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => select(action)}
                className={`p-3 text-body font-semibold rounded-control border transition-all text-left flex justify-between items-center ${
                  selectedId === action.id
                    ? variantStyles[action.variant].selected
                    : variantStyles[action.variant].idle
                }`}
              >
                {action.label}
                {selectedId === action.id && <Icon name="check" size={16} strokeWidth={2.5} />}
              </button>
            ))}
          </div>
        </div>

        {selectedId && (
          <div className="mt-4">
            <h4 className="text-micro uppercase text-ink-muted ml-1 mb-2">
              Antwort anpassen & senden
            </h4>
            <textarea
              className={`${inputClass} resize-none shadow-card`}
              rows={4}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <Button size="lg" block icon="copy" className="mt-3" onClick={copyToClipboard}>
              Antwort kopieren
            </Button>
            <p className="text-label font-normal text-ink-faint text-center mt-2">
              Für {platform} muss die Antwort manuell eingefügt werden.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
