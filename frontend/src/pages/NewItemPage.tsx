import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import { PhotoCapture } from '../components/PhotoCapture';
import { ActionBar, Button, Card, Icon, PageHeader, Spinner, inputClass } from '../ui';

/**
 * README §3 Schritt 1: "Fotografieren statt Formulare ausfüllen." Der
 * Nutzer wählt/fotografiert den Artikel — Item-Erstellung, Foto-Upload und
 * KI-Analyse laufen dahinter als EIN zusammenhängender Vorgang, nicht als
 * drei separate Klicks.
 */
export function NewItemPage() {
  const location = useLocation();
  const prefillTitle = (location.state as { title?: string } | null)?.title ?? '';
  const [photos, setPhotos] = useState<File[]>([]);
  const [title, setTitle] = useState(prefillTitle);
  const [titleExpanded, setTitleExpanded] = useState(!!prefillTitle);
  const [stage, setStage] = useState<'idle' | 'creating' | 'uploading' | 'analyzing'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const creating = stage !== 'idle';

  const start = async () => {
    setError(null);
    setUploadProgress(0);
    let createdItemId: string | null = null;
    try {
      setStage('creating');
      const item = await itemsApi.create(title || undefined);
      createdItemId = item.id;
      setStage('uploading');
      await itemsApi.analyze(item.id, photos, (fraction) => {
        setUploadProgress(fraction);
        // Ab hier ist der Upload selbst fertig, der Server braucht noch Zeit
        // für die KI-Analyse (dafür gibt es keinen Fortschritt zu melden) —
        // sonst bliebe die Anzeige bei "100%" stehen und wirkt wie hängend.
        if (fraction >= 0.999) setStage('analyzing');
      });
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
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 h-10 pl-1 pr-3 -ml-1 rounded-full text-body text-ink-muted hover:bg-surface-hover hover:text-ink"
      >
        <Icon name="chevronLeft" size={20} />
        Heute
      </button>
      <PageHeader
        title="Neuer Artikel"
        subtitle="Fotografiere den Gegenstand, ein Etikett oder Typenschild. Die KI trägt nur ein, was sie sieht. Fehlende Pflichtangaben der Kategorie fragst du danach."
      />

      <Card className="p-4 space-y-4">
        <PhotoCapture files={photos} onChange={setPhotos} />

        <details
          className="text-body"
          open={titleExpanded}
          onToggle={(e) => setTitleExpanded((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-ink-muted font-medium">
            Titel schon jetzt vergeben (optional)
          </summary>
          <input
            type="text"
            placeholder="z.B. Herrenjacke schwarz"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`${inputClass} mt-2`}
          />
        </details>

        {error && <p className="text-label text-danger">{error}</p>}

        {stage === 'uploading' && (
          <div className="w-full h-1.5 rounded-full bg-line overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-150"
              style={{ width: `${Math.round(uploadProgress * 100)}%` }}
            />
          </div>
        )}
      </Card>

      <ActionBar>
        <Button size="lg" disabled={creating || photos.length === 0} onClick={start}>
          {stage === 'creating' && 'Artikel wird angelegt…'}
          {stage === 'uploading' && `Fotos werden hochgeladen… ${Math.round(uploadProgress * 100)}%`}
          {stage === 'analyzing' && (
            <span className="inline-flex items-center gap-2">
              <Spinner />
              KI analysiert die Fotos…
            </span>
          )}
          {stage === 'idle' && 'Analysieren'}
        </Button>
      </ActionBar>
    </div>
  );
}
