import React, { useState } from 'react';

// ==============================================================================
// Mock-Daten: ProductTruth (Faktenbasis für die Verhandlung)
// ==============================================================================
const productContext = {
  title: "Sony PlayStation 4 - 500GB",
  targetPrice: 120, // Unser Wunschpreis
  minAcceptablePrice: 95, // Darunter gehen wir nicht
  logistics: "versand_moeglich",
  shippingCost: 6.99
};

// Mock-Daten: Eingehende Nachricht eines Käufers
const incomingMessage = {
  buyerName: "Alex99",
  platform: "Kleinanzeigen",
  text: "Hallo, ich biete 80€ und komme es heute Abend direkt abholen. Barzahlung. LG",
  timestamp: "15:42"
};

// ==============================================================================
// Mock-Daten: KI-Analyse der Nachricht (Würde vom Backend kommen)
// ==============================================================================
const aiAnalysis = {
  intent: "NEGOTIATION_AND_PICKUP",
  offeredPrice: 80,
  assessment: "Käufer bietet schnelle, problemlose Abwicklung, liegt aber 15€ unter deiner absoluten Schmerzgrenze (95€).",
  suggestedActions: [
    {
      id: "counter",
      label: "Gegenangebot: 100€",
      type: "primary",
      text: "Hallo Alex, 80€ ist mir leider zu wenig. Für glatte 100€ kannst du sie heute Abend abholen kommen. Wie sieht's aus?"
    },
    {
      id: "firm_min",
      label: "Schmerzgrenze: 95€",
      type: "secondary",
      text: "Hallo Alex, danke fürs Angebot. Mein absoluter Tiefstpreis sind 95€. Wenn das für dich passt, können wir eine Uhrzeit für heute Abend ausmachen."
    },
    {
      id: "decline",
      label: "Höflich ablehnen",
      type: "danger",
      text: "Hallo Alex, danke für dein Angebot, aber das ist mir leider zu wenig. Viel Erfolg bei der weiteren Suche!"
    }
  ]
};

export default function NegotiationAssistant() {
  const [selectedReply, setSelectedReply] = useState(null);
  const [customReply, setCustomReply] = useState("");

  const handleSelectSuggestion = (suggestion) => {
    setSelectedReply(suggestion.id);
    setCustomReply(suggestion.text);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(customReply);
    alert("Antwort kopiert! Du kannst sie nun bei Kleinanzeigen einfügen.");
  };

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white p-4 border-b flex items-center justify-between shadow-sm z-10">
        <div>
          <h1 className="font-bold text-gray-800 text-lg">Chat Assistent</h1>
          <p className="text-xs text-gray-500 line-clamp-1">{productContext.title}</p>
        </div>
        <div className="text-right">
          <span className="block text-xs text-gray-400 uppercase font-bold">Dein Ziel</span>
          <span className="font-bold text-blue-600">{productContext.targetPrice} €</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Chat-Bubble: Käufer */}
        <div className="flex flex-col items-start">
          <span className="text-xs text-gray-500 ml-1 mb-1 font-medium">{incomingMessage.buyerName} (via {incomingMessage.platform})</span>
          <div className="bg-white p-4 rounded-2xl rounded-tl-sm shadow-sm border border-gray-100 max-w-[90%]">
            <p className="text-gray-800 text-sm">{incomingMessage.text}</p>
          </div>
          <span className="text-[10px] text-gray-400 mt-1 ml-1">{incomingMessage.timestamp}</span>
        </div>

        {/* KI-Analyse Panel */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-blue-500">✨</span>
            <h3 className="font-bold text-blue-900 text-sm">KI-Einschätzung</h3>
          </div>
          
          <div className="flex justify-between items-end mb-3">
            <div>
              <span className="block text-[10px] uppercase font-bold text-blue-400">Gebot</span>
              <span className="font-bold text-xl text-red-600">{aiAnalysis.offeredPrice} €</span>
            </div>
            <div className="text-right">
              <span className="block text-[10px] uppercase font-bold text-blue-400">Deine Schmerzgrenze</span>
              <span className="font-medium text-sm text-gray-600">{productContext.minAcceptablePrice} €</span>
            </div>
          </div>
          
          <p className="text-xs text-blue-800 leading-relaxed bg-white p-3 rounded-lg border border-blue-100">
            {aiAnalysis.assessment}
          </p>
        </div>

        {/* Antwort-Optionen */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-gray-500 uppercase ml-1">Antwort-Strategie wählen</h4>
          <div className="flex flex-col gap-2">
            {aiAnalysis.suggestedActions.map((action) => (
              <button
                key={action.id}
                onClick={() => handleSelectSuggestion(action)}
                className={`p-3 text-sm font-semibold rounded-xl border transition-all text-left flex justify-between items-center
                  ${selectedReply === action.id 
                    ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm' 
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
              >
                {action.label}
                {selectedReply === action.id && <span className="text-blue-500">✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Editor für die ausgewählte Antwort */}
        {selectedReply && (
          <div className="animate-fade-in-up mt-4">
            <h4 className="text-xs font-bold text-gray-500 uppercase ml-1 mb-2">Antwort anpassen & Senden</h4>
            <textarea
              className="w-full bg-white p-4 rounded-xl border border-gray-200 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 resize-none shadow-sm"
              rows="4"
              value={customReply}
              onChange={(e) => setCustomReply(e.target.value)}
            />
            
            {/* Senden / Kopieren Button */}
            <button 
              onClick={copyToClipboard}
              className="w-full mt-3 bg-black text-white font-bold p-4 rounded-xl shadow-lg hover:bg-gray-800 transition active:scale-95 flex justify-center items-center gap-2"
            >
              Antwort kopieren
            </button>
            <p className="text-[10px] text-gray-400 text-center mt-2">
              Für {incomingMessage.platform} muss die Antwort manuell eingefügt werden.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}