import { useEffect, useRef, useState } from 'react';
import { itemsApi } from '../api/items';

/**
 * README §3 Schritt 1 "Foto-Erfassung": der gesamte Workflow beginnt mit
 * dem Foto, nicht mit einem Formular. `capture="environment"` öffnet auf
 * Mobilgeräten direkt die Rückkamera (PWA-Nutzung, Schritt 6).
 *
 * `itemId` ist optional: die "Optimieren"-Aktion (§9e-Ergänzung, Nano
 * Banana) braucht ein bereits angelegtes Item (POST /items/:id/optimize-
 * photo) — beim allerersten Foto-Auswahlschritt vor der Item-Erstellung
 * (NewItemPage) gibt es das noch nicht, dort bleibt der Button einfach weg.
 */
export function PhotoCapture({
  files,
  onChange,
  itemId,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  itemId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [optimizingIndex, setOptimizingIndex] = useState<number | null>(null);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [confirmRemoveIndex, setConfirmRemoveIndex] = useState<number | null>(null);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    onChange([...files, ...Array.from(list)]);
  };

  const removeAt = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
    setConfirmRemoveIndex(null);
  };

  // Kleine Thumbnails im 3er-Grid sind leicht aus Versehen zu treffen —
  // erster Tap fragt nach, statt das Foto sofort ohne Rückfrage zu
  // entfernen (Foto ist danach nicht mehr wiederherstellbar).
  const requestRemove = (index: number) => {
    if (confirmRemoveIndex === index) {
      removeAt(index);
    } else {
      setConfirmRemoveIndex(index);
      setTimeout(() => setConfirmRemoveIndex((current) => (current === index ? null : current)), 2500);
    }
  };

  const optimize = async (index: number) => {
    if (!itemId) return;
    setOptimizingIndex(index);
    setOptimizeError(null);
    try {
      const result = await itemsApi.optimizePhoto(itemId, files[index]);
      if (result.url) {
        // Bewusst kein automatischer Ersatz des Originals (§9d-Prinzip
        // "keine Automatik ohne Bestätigung") — öffnet das optimierte
        // Bild zum Vergleich, der Mensch entscheidet, ob er es
        // stattdessen als eigenes Foto hochlädt.
        window.open(result.url, '_blank');
      } else {
        setOptimizeError('Optimierung fehlgeschlagen — Originalfoto bleibt unverändert.');
      }
    } catch {
      setOptimizeError('Optimierung fehlgeschlagen — Originalfoto bleibt unverändert.');
    } finally {
      setOptimizingIndex(null);
    }
  };

  return (
    <div className="space-y-3">
      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {previews.map((src, i) => (
            <div key={src} className="relative aspect-square rounded-xl overflow-hidden border border-line">
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => requestRemove(i)}
                className={
                  confirmRemoveIndex === i
                    ? 'absolute top-1 right-1 h-6 px-2 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center backdrop-blur'
                    : 'absolute top-1 right-1 w-7 h-7 rounded-full bg-ink/70 text-white text-base flex items-center justify-center backdrop-blur'
                }
                aria-label={confirmRemoveIndex === i ? 'Wirklich entfernen?' : 'Foto entfernen'}
              >
                {confirmRemoveIndex === i ? 'Entfernen?' : '×'}
              </button>
              {itemId && (
                <button
                  type="button"
                  onClick={() => optimize(i)}
                  disabled={optimizingIndex === i}
                  className="absolute bottom-1 left-1 right-1 py-1 rounded-lg bg-ink/70 text-white text-[10px] font-semibold disabled:opacity-60 backdrop-blur"
                >
                  {optimizingIndex === i ? 'Optimiert…' : '✨ Optimieren'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {optimizeError && <p className="text-xs text-danger">{optimizeError}</p>}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full p-6 rounded-2xl border-2 border-dashed border-line text-ink-muted text-sm font-semibold hover:border-accent hover:bg-accent-soft/40 hover:text-accent transition-colors flex flex-col items-center gap-1"
      >
        <span className="text-2xl">📷</span>
        {files.length === 0 ? 'Foto aufnehmen / auswählen' : 'Weiteres Foto hinzufügen'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
