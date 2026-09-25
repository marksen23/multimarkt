import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import { PhotoCapture } from '../components/PhotoCapture';

/**
 * README §3 Schritt 1: "Fotografieren statt Formulare ausfüllen." Der
 * Nutzer wählt/fotografiert den Artikel — Item-Erstellung, Foto-Upload und
 * KI-Analyse laufen dahinter als EIN zusammenhängender Vorgang, nicht als
 * drei separate Klicks.
 */
export function NewItemPage() {
  const [photos, setPhotos] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState<'idle' | 'creating' | 'uploading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const creating = stage !== 'idle';

  const start = async () => {
    setError(null);
    let createdItemId: string | null = null;
    try {
      setStage('creating');
      const item = await itemsApi.create(title || undefined);
      createdItemId = item.id;
      setStage('uploading');
      await itemsApi.analyze(item.id, photos);
      navigate(`/items/${item.id}`);
    } catch (e) {
      if (createdItemId) {
        // Item + Fotos sind serverseitig bereits angelegt (Foto-Persistenz
        // läuft unabhängig vom Analyse-Ausgang, siehe items.controller.ts)
        // — nicht verwaist mit nur einer Fehlermeldung zurücklassen, sondern
        // zur Artikelseite weiterleiten, wo die Analyse erneut angestoßen
        // werden kann, statt bei einem erneuten Versuch hier ein Duplikat
        // samt Doppel-Upload zu erzeugen.
        navigate(`/items/${createdItemId}`);
        return;
      }
      setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
    } finally {
      setStage('idle');
    }
  };

  return (
    <div className="max-w-sm mx-auto p-6">
      <div className="bg-surface rounded-2xl shadow-sm border border-line p-6 space-y-4">
        <div>
          <h1 className="text-xl font-extrabold text-ink tracking-tight">Neuer Artikel</h1>
          <p className="text-sm text-ink-muted mt-1">
            Fotografiere den Gegenstand, ein Etikett oder Typenschild. Die KI schlägt danach
            Kategorie, Marke und weitere Angaben vor — du bestätigst.
          </p>
        </div>

        <PhotoCapture files={photos} onChange={setPhotos} />

        <details className="text-sm">
          <summary className="cursor-pointer text-ink-muted font-medium">
            Titel schon jetzt vergeben (optional)
          </summary>
          <input
            type="text"
            placeholder="z.B. Herrenjacke schwarz"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-2 w-full p-3 border border-line rounded-xl text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition"
          />
        </details>

        {error && <p className="text-xs text-danger">{error}</p>}

        <button
          type="button"
          disabled={creating || photos.length === 0}
          onClick={start}
          className="w-full p-3 rounded-xl font-bold bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
        >
          {stage === 'creating' && 'Artikel wird angelegt…'}
          {stage === 'uploading' && 'Fotos werden hochgeladen & analysiert…'}
          {stage === 'idle' && 'Weiter'}
        </button>

        <div className="flex justify-center gap-4">
          <a href="/demo/confidence-center" className="text-xs text-ink-faint hover:text-ink-muted">
            Confidence-Center-Demo
          </a>
          <a href="/demo/negotiation" className="text-xs text-ink-faint hover:text-ink-muted">
            Chat-Assistent-Demo
          </a>
        </div>
      </div>
    </div>
  );
}
