import { useEffect, useRef, useState } from 'react';
import type { ItemPhoto } from '../api/types';
import {
  isPhotoShot,
  PHOTO_SHOT_LABELS,
  type MissingPhotoShot,
  type PhotoShotNeed,
} from '../category/photo-briefing';
import {
  enhancementProgress,
  photoTipLines,
  publishVersionHint,
  showingEnhanced,
  shownPhotoUrl,
} from '../lib/photo-display';
import { Icon } from '../ui';

/**
 * Fotogalerie pro Artikel. Sobald die Kategorie feststeht, trägt jedes
 * Foto eine Aufnahme (Gesamtes Stück, Etikett, …). Die Zuordnung ist frei,
 * Speichern hängt nicht daran.
 */
export function PhotoGallery({
  photos,
  requiredShots = [],
  missingShots = [],
  busy,
  onShotChange,
  onAdd,
  onPrefer,
  onMakeCover,
}: {
  photos: ItemPhoto[];
  requiredShots?: PhotoShotNeed[];
  missingShots?: MissingPhotoShot[];
  busy?: boolean;
  onShotChange?: (photoId: string, shot: string | null) => void;
  onAdd?: (file: File, shot: string | null) => void;
  onPrefer?: (photoId: string, preferEnhanced: boolean) => void;
  onMakeCover?: (photoId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const missingKey = missingShots.map((shot) => shot.shot).join('|');
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedFor, setPickedFor] = useState(missingKey);
  if (pickedFor !== missingKey) {
    setPickedFor(missingKey);
    setPicked(null);
  }
  const nextShot = picked ?? missingShots[0]?.shot ?? '';
  const progress = enhancementProgress(photos);
  const tips = photoTipLines(photos);
  const versionHint = publishVersionHint(photos);
  const suggestedIndex = photos.findIndex((photo, index) => photo.suggestedCover && index > 0);

  if (photos.length === 0 && !onAdd) return null;

  const addFile = (list: FileList | null) => {
    const file = list?.[0];
    if (!file || !onAdd) return;
    onAdd(file, nextShot || null);
  };

  return (
    <div className="space-y-3">
      {progress.active && progress.text && (
        <div className="space-y-1.5" role="status">
          <p className="text-label text-ink-muted">{progress.text}</p>
          <p className="text-label font-normal text-ink-faint">
            Die fertige Version geht an eBay und in die Kleinanzeigen-ZIP. Solange sie noch läuft, wird das Original genommen.
          </p>
          <div
            className="h-1.5 rounded-full bg-line overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-label="Foto-Verbesserung"
          >
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {suggestedIndex >= 0 && onMakeCover && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line px-3 py-2">
          <p className="text-label text-ink min-w-0">Foto {suggestedIndex + 1} eignet sich besser als Titelbild.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onMakeCover(photos[suggestedIndex].id)}
            className="shrink-0 px-2.5 py-1.5 rounded-control bg-accent text-white text-label font-semibold disabled:opacity-60"
          >
            Als Titelbild
          </button>
        </div>
      )}

      {photos.length > 0 && (
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, i) => {
          const options = [...requiredShots];
          if (isPhotoShot(photo.shot) && !options.some((shot) => shot.shot === photo.shot)) {
            options.unshift({ shot: photo.shot, label: PHOTO_SHOT_LABELS[photo.shot] });
          }
          const enhanced = showingEnhanced(photo);
          return (
          <div key={photo.id} className="space-y-1">
          <button
            type="button"
            onClick={() => setLightbox(i)}
            className="relative aspect-square w-full rounded-control overflow-hidden border border-line hover:opacity-90 transition focus:outline-none focus:ring-2 focus:ring-accent-soft"
            aria-label={`Foto ${i + 1} vergrößern`}
          >
            <img src={shownPhotoUrl(photo)} alt="" className="w-full h-full object-cover" />
            {i === 0 && (
              <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-ink/70 text-white text-micro">
                Titelbild
              </span>
            )}
          </button>
          {(photo.enhancementStatus === 'pending' || photo.enhancementStatus === 'processing') && (
            <p className="text-micro normal-case tracking-normal text-ink-faint text-center">Wird verbessert</p>
          )}
          {photo.enhancementStatus === 'failed' && (
            <p className="text-micro normal-case tracking-normal text-ink-faint text-center">Original bleibt</p>
          )}
          {photo.enhancementStatus === 'ready' && photo.enhancedUrl && onPrefer && (
            <div className="flex flex-col gap-1" role="group" aria-label={`Version für Foto ${i + 1}`}>
              <button
                type="button"
                disabled={busy || !enhanced}
                aria-pressed={!enhanced}
                onClick={() => onPrefer(photo.id, false)}
                className={`h-8 rounded-control text-micro normal-case tracking-normal ${enhanced ? 'border border-line text-ink-muted' : 'bg-ink text-white'}`}
              >
                Original
              </button>
              <button
                type="button"
                disabled={busy || enhanced}
                aria-pressed={enhanced}
                onClick={() => onPrefer(photo.id, true)}
                className={`h-8 rounded-control text-micro normal-case tracking-normal ${enhanced ? 'bg-ink text-white' : 'border border-line text-ink-muted'}`}
              >
                Verbessert
              </button>
            </div>
          )}
          {requiredShots.length > 0 && onShotChange && (
            <select
              aria-label={`Aufnahme für Foto ${i + 1}`}
              value={photo.shot ?? ''}
              disabled={busy}
              onChange={(event) => onShotChange(photo.id, event.target.value || null)}
              className="w-full text-label border border-line rounded-control px-1 py-1 bg-surface text-ink outline-none focus:border-accent"
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

      {tips.length > 0 && (
        <ul className="space-y-1.5">
          {tips.map((tip) => (
            <li key={`${tip.label}-${tip.message}`} className="text-label font-normal text-ink-muted">
              <span className="font-semibold text-ink">{tip.label}.</span> {tip.message}
            </li>
          ))}
        </ul>
      )}

      {versionHint && <p className="text-label font-normal text-ink-faint">{versionHint}</p>}

      {onAdd && (
        <div className="flex gap-2">
          {requiredShots.length > 0 && (
            <select
              aria-label="Aufnahme für das nächste Foto"
              value={nextShot}
              disabled={busy}
              onChange={(event) => setPicked(event.target.value)}
              className="min-w-0 flex-1 text-label border border-line rounded-control px-2 py-2 bg-surface text-ink outline-none focus:border-accent"
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
            className="shrink-0 px-3 py-2 rounded-control border border-line text-label font-semibold text-ink-muted hover:border-accent hover:text-accent disabled:opacity-60 transition-colors"
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

      {lightbox !== null && (
        <PhotoLightbox
          photos={photos}
          index={lightbox}
          onChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

function PhotoLightbox({
  photos,
  index,
  onChange,
  onClose,
}: {
  photos: ItemPhoto[];
  index: number;
  onChange: (i: number) => void;
  onClose: () => void;
}) {
  const canPrev = index > 0;
  const canNext = index < photos.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && canPrev) onChange(index - 1);
      if (e.key === 'ArrowRight' && canNext) onChange(index + 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, canPrev, canNext, onChange, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Fotogalerie"
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Main image */}
      <img
        src={shownPhotoUrl(photos[index])}
        alt=""
        className="max-h-[85vh] max-w-[90vw] object-contain rounded-control shadow-float"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        autoFocus
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition"
        aria-label="Schließen"
      >
        <Icon name="x" size={20} />
      </button>

      {/* Counter */}
      {photos.length > 1 && (
        <span className="absolute top-4 left-4 text-label tabular-nums text-white/70 bg-black/30 px-2 py-1 rounded-full">
          {index + 1} / {photos.length}
        </span>
      )}

      {/* Prev */}
      {canPrev && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(index - 1); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition"
          aria-label="Vorheriges Foto"
        >
          <Icon name="chevronLeft" size={22} />
        </button>
      )}

      {/* Next */}
      {canNext && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(index + 1); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition"
          aria-label="Nächstes Foto"
        >
          <Icon name="chevronRight" size={22} />
        </button>
      )}

      {/* Thumbnail strip for multi-photo */}
      {photos.length > 1 && (
        <div
          className="absolute bottom-4 flex gap-1.5 px-4"
          onClick={(e) => e.stopPropagation()}
        >
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(i)}
              className={`w-10 h-10 rounded-control overflow-hidden border-2 transition flex-shrink-0 ${
                i === index ? 'border-white' : 'border-white/20 opacity-60 hover:opacity-80'
              }`}
              aria-label={`Foto ${i + 1}`}
            >
              <img src={p.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
