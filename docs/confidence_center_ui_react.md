import React, { useState, useEffect } from 'react';

// ==============================================================================
// Mock-Daten: So würde ein Datensatz aus der neuen ProductTruth-DB im Frontend ankommen
// ==============================================================================
const initialProductTruth = {
  id: "uuid-1234",
  state: "REVIEW_REQUIRED",
  // Der rechtlich bindende Zustand (zwingend erforderlich!)
  condition: { value: null, status: "MISSING" }, 
  
  // Die dynamischen Attribute mit Herkunftsnachweis (Provenance)
  attributes: {
    brand: { value: "Nike", status: "USER_CONFIRMED", source: "OCR_PIPELINE", confidence: 0.99 },
    category: { value: "Herren > Schuhe > Sneaker", status: "INFERRED", source: "GEMINI_VISION", confidence: 0.95 },
    color: { value: "Schwarz/Weiß", status: "INFERRED", source: "GEMINI_VISION", confidence: 0.82 },
    material: { value: "Leder/Mesh", status: "INFERRED", source: "GEMINI_VISION", confidence: 0.65 },
    size: { value: null, status: "MISSING" }
  }
};

export default function ConfidenceCenter() {
  const [product, setProduct] = useState(initialProductTruth);
  const [isReady, setIsReady] = useState(false);

  // Prüft, ob alle Pflichtfelder (Condition + Missing) vom User bestätigt wurden
  useEffect(() => {
    const isConditionConfirmed = product.condition.status === "USER_CONFIRMED";
    const hasMissingAttributes = Object.values(product.attributes).some(attr => attr.status === "MISSING");
    
    setIsReady(isConditionConfirmed && !hasMissingAttributes);
  }, [product]);

  // Handler für 1-Klick-Bestätigungen (Gelb -> Grün)
  const confirmAttribute = (key) => {
    setProduct(prev => ({
      ...prev,
      attributes: {
        ...prev.attributes,
        [key]: { ...prev.attributes[key], status: "USER_CONFIRMED" }
      }
    }));
  };

  // Handler für manuelle Eingaben (Fehlend -> Grün)
  const updateAttribute = (key, newValue) => {
    setProduct(prev => ({
      ...prev,
      attributes: {
        ...prev.attributes,
        [key]: { value: newValue, status: "USER_CONFIRMED", source: "USER_INPUT", confidence: 1.0 }
      }
    }));
  };

  const updateCondition = (condValue) => {
    setProduct(prev => ({
      ...prev,
      condition: { value: condValue, status: "USER_CONFIRMED", source: "USER_INPUT", confidence: 1.0 }
    }));
  };

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen pb-24">
      {/* Header */}
      <header className="bg-white p-4 border-b sticky top-0 z-10 flex justify-between items-center shadow-sm">
        <h1 className="font-bold text-gray-800 text-lg">Entwurf prüfen</h1>
        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-semibold uppercase tracking-wide">
          Confidence Center
        </span>
      </header>

      <div className="p-4 space-y-6">
        
        {/* Info-Block */}
        <p className="text-sm text-gray-600">
          Die KI hat dein Foto analysiert. Bitte überprüfe die Angaben. 
          <strong> Keine Information geht ohne deine Bestätigung online.</strong>
        </p>

        {/* 1. SEKTION: Fehlend / Zwingend erforderlich (ROT) */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            Zwingend erforderlich
          </h2>
          
          {/* Zustand (Harte Regel aus der DB) */}
          <div className={`p-4 rounded-xl border-2 transition-all ${product.condition.status === 'USER_CONFIRMED' ? 'bg-white border-green-200' : 'bg-red-50 border-red-200'}`}>
            <label className="block text-sm font-bold text-gray-800 mb-2">Wie ist der Zustand?</label>
            <div className="grid grid-cols-3 gap-2">
              {['Neu', 'Sehr gut', 'Gebraucht'].map(cond => (
                <button 
                  key={cond}
                  onClick={() => updateCondition(cond)}
                  className={`py-2 px-1 text-xs rounded-lg border font-bold transition ${product.condition.value === cond ? 'bg-red-600 border-red-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                >
                  {cond}
                </button>
              ))}
            </div>
          </div>

          {/* Andere fehlende Attribute */}
          {Object.entries(product.attributes).filter(([_, attr]) => attr.status === 'MISSING').map(([key, attr]) => (
             <div key={key} className="bg-red-50 p-4 rounded-xl border border-red-100">
               <label className="block text-sm font-bold text-gray-800 mb-2 capitalize">Welche {key} hat der Artikel?</label>
               <input 
                 type="text" 
                 placeholder={`Bitte ${key} eingeben...`}
                 className="w-full p-2 border border-red-200 rounded-lg text-sm outline-none focus:border-red-500"
                 onBlur={(e) => {
                   if(e.target.value) updateAttribute(key, e.target.value);
                 }}
               />
             </div>
          ))}
        </section>

        {/* 2. SEKTION: KI-Vermutungen zur Bestätigung (GELB) */}
        {Object.values(product.attributes).some(a => a.status === 'INFERRED') && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
              KI-Vermutungen (Bitte prüfen)
            </h2>
            <div className="bg-yellow-50 rounded-xl border border-yellow-200 divide-y divide-yellow-100 overflow-hidden">
              {Object.entries(product.attributes)
                .filter(([_, attr]) => attr.status === 'INFERRED')
                .map(([key, attr]) => (
                  <div key={key} className="p-3 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-yellow-800 capitalize font-medium block">{key}</span>
                      <span className="font-bold text-gray-800">{attr.value}</span>
                    </div>
                    <div className="flex gap-2">
                      <button className="p-2 bg-white rounded-lg border border-yellow-200 text-gray-500 hover:bg-gray-100">
                        Ändern
                      </button>
                      <button 
                        onClick={() => confirmAttribute(key)}
                        className="px-3 py-2 bg-yellow-400 text-yellow-900 rounded-lg font-bold text-sm shadow-sm hover:bg-yellow-500"
                      >
                        Stimmt
                      </button>
                    </div>
                  </div>
              ))}
            </div>
          </section>
        )}

        {/* 3. SEKTION: Bestätigte Daten (GRÜN) */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Sichere Daten
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 gap-4">
            {Object.entries(product.attributes)
              .filter(([_, attr]) => attr.status === 'USER_CONFIRMED')
              .map(([key, attr]) => (
                <div key={key}>
                  <span className="text-[10px] text-gray-400 uppercase font-bold capitalize flex items-center gap-1">
                    {key}
                    {attr.source === 'OCR_PIPELINE' && <span title="Aus Etikett gelesen" className="text-blue-400">🔍</span>}
                  </span>
                  <span className="font-semibold text-gray-800 block text-sm truncate">{attr.value}</span>
                </div>
            ))}
          </div>
        </section>

      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent">
        <button 
          disabled={!isReady}
          className={`w-full p-4 rounded-xl font-bold flex items-center justify-center transition-all ${
            isReady 
              ? 'bg-black text-white shadow-xl hover:bg-gray-800 translate-y-0' 
              : 'bg-gray-200 text-gray-400 cursor-not-allowed translate-y-1'
          }`}
        >
          {isReady ? 'Strategie & Preis festlegen' : 'Bitte offene Felder prüfen'}
        </button>
      </div>

    </div>
  );
}