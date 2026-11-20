import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import { CaptureProgress } from '../components/CaptureProgress';
import { PhotoCapture } from '../components/PhotoCapture';
import { Button, Card, Field, Icon, Notice, PageHeader, inputClass } from '../ui';

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
  const [hint, setHint] = useState('');
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
      }, hint);
      navigate(`/items/${item.id}`);
    } catch (e) {
      if (createdItemId) {
        // Item + Fotos sind serverseitig bereits angelegt (Foto-Persistenz
        // läuft unabhängig vom Analyse-Ausgang, siehe items.controller.ts)
        // — nicht verwaist mit nur einer Fehlermeldung zurücklassen, sondern
        // zur Artikelseite weiterleiten, wo die Analyse erneut angestoßen
        // werden kann, statt bei einem erneuten Versuch hier ein Duplikat
        // samt Doppel-Upload zu erzeugen.
        const message = e instanceof ApiRequestError ? e.body.message : 'Die Analyse ist fehlgeschlagen.';
        navigate(`/items/${createdItemId}`, { state: { analysisError: message } });
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
        aria-label="Zurück"
        className="inline-flex items-center gap-1 h-10 pl-1 pr-3 -ml-1 rounded-full text-body text-ink-muted hover:bg-surface-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Icon name="chevronLeft" size={20} />
        Zurück
      </button>
      <PageHeader
        title="Neuer Artikel"
        subtitle="Fotografiere den Gegenstand. Ein zweites Foto vom Etikett oder Typenschild hilft bei Marke und Modell. Die KI trägt nur ein, was sie sieht, und markiert Unsicheres."
      />

      <Card className="p-4 space-y-4">
        <PhotoCapture files={photos} onChange={setPhotos} />

        <Field
          label="Hinweis für die KI (optional)"
          hint="Hilft bei Marke und Modell. Was nur im Hinweis steht und nicht auf dem Foto zu sehen ist, wird als unsicher markiert."
        >
          <input
            type="text"
            enterKeyHint="done"
            aria-label="Hinweis für die KI"
            placeholder="z.B. Bosch Bohrmaschine"
            maxLength={200}
            value={hint}
            onChange={(event) => setHint(event.target.value)}
            className={inputClass}
          />
        </Field>

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
            enterKeyHint="done"
            aria-label="Artikeltitel (optional)"
            placeholder="z.B. Herrenjacke schwarz"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`${inputClass} mt-2`}
          />
        </details>

        {error && <Notice tone="danger">{error}</Notice>}
      </Card>

      <div className="sticky bottom-above-nav z-10 -mx-4 px-4 pt-3 pb-3 bg-gradient-to-t from-bg via-bg/95 to-transparent space-y-2">
        {stage !== 'idle' && <CaptureProgress stage={stage} uploadPercent={uploadProgress * 100} />}
        <Button size="lg" block loading={creating} disabled={creating || photos.length === 0} onClick={start}>
          {stage === 'creating' && 'Artikel wird angelegt…'}
          {stage === 'uploading' && `Fotos werden hochgeladen… ${Math.round(uploadProgress * 100)}%`}
          {stage === 'analyzing' && 'KI analysiert die Fotos…'}
          {stage === 'idle' && 'Analysieren'}
        </Button>
      </div>
    </div>
  );
}
