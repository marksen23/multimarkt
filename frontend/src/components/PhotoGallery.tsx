import { useRef, useState } from 'react';
import type { ItemPhoto } from '../api/types';
import {
  isPhotoShot,
  PHOTO_SHOT_LABELS,
  type MissingPhotoShot,
  type PhotoShotNeed,
} from '../category/photo-briefing';

/**
 * Fotogalerie pro Artikel. Sobald die Kategorie feststeht, trägt jedes
 * Foto eine Aufnahme (Gesamtes Stück, Etikett, …). Die Zuordnung ist frei,
 * Speichern hängt nicht daran.
 */
export function PhotoGallery({
  photos,
  requiredShots,
  missingShots,
  busy,
  onShotChange,
  onAdd,
}: {
  photos: ItemPhoto[];
  requiredShots: PhotoShotNeed[];
  missingShots: MissingPhotoShot[];
  busy?: boolean;
  onShotChange?: (photoId: string, shot: string | null) => void;
  onAdd?: (file: File, shot: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const missingKey = missingShots.map((shot) => shot.shot).join('|');
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedFor, setPickedFor] = useState(missingKey);
  if (pickedFor !== missingKey) {
    setPickedFor(missingKey);
    setPicked(null);
  }
  const nextShot = picked ?? missingShots[0]?.shot ?? '';

  if (photos.length === 0 && !onAdd) return null;

  const addFile = (list: FileList | null) => {
    const file = list?.[0];
    if (!file || !onAdd) return;
    onAdd(file, nextShot || null);
  };

  return (
    <div className="space-y-3">
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo, index) => {
            const options = [...requiredShots];
            if (isPhotoShot(photo.shot) && !options.some((shot) => shot.shot === photo.shot)) {
              options.unshift({ shot: photo.shot, label: PHOTO_SHOT_LABELS[photo.shot] });
            }
            return (
              <div key={photo.id} className="space-y-1">
                <a
                  href={photo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="aspect-square rounded-xl overflow-hidden border border-line block hover:opacity-90 transition"
                >
                  <img src={photo.url} alt="" className="w-full h-full object-cover" />
                </a>
                {requiredShots.length > 0 && onShotChange && (
                  <select
                    aria-label={`Aufnahme für Foto ${index + 1}`}
                    value={photo.shot ?? ''}
                    disabled={busy}
                    onChange={(event) => onShotChange(photo.id, event.target.value || null)}
                    className="w-full text-[11px] border border-line rounded-lg px-1 py-1 bg-surface text-ink outline-none focus:border-accent"
                  >
                    <option value="">Aufnahme wählen…</option>
                    {options.map((shot) => (
                      <option key={shot.shot} value={shot.shot}>
                        {shot.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}

      {onAdd && (
        <div className="flex gap-2">
          {requiredShots.length > 0 && (
            <select
              aria-label="Aufnahme für das nächste Foto"
              value={nextShot}
              disabled={busy}
              onChange={(event) => setPicked(event.target.value)}
              className="min-w-0 flex-1 text-xs border border-line rounded-lg px-2 py-2 bg-surface text-ink outline-none focus:border-accent"
            >
              <option value="">Ohne Zuordnung</option>
              {requiredShots.map((shot) => (
                <option key={shot.shot} value={shot.shot}>
                  {shot.label}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="shrink-0 px-3 py-2 rounded-lg border border-line text-xs font-semibold text-ink-muted hover:border-accent hover:text-accent disabled:opacity-60 transition-colors"
          >
            Foto hinzufügen
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              addFile(event.target.files);
              event.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}
