import { useEffect, useState } from 'react';
import type { ItemPhoto } from '../api/types';

/**
 * Fotogalerie pro Artikel (September 2026) — zeigt die dauerhaft mit dem
 * Item verknüpften Fotos (backend/src/infrastructure/database/entities/
 * item-photo.entity.ts). Unabhängig vom Item-Status sichtbar, nicht nur
 * während des Analyse-Schritts.
 */
export function PhotoGallery({ photos }: { photos: ItemPhoto[] }) {
  const [lightbox, setLightbox] = useState<number | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setLightbox(i)}
            className="aspect-square rounded-xl overflow-hidden border border-line hover:opacity-90 transition focus:outline-none focus:ring-2 focus:ring-accent-soft"
            aria-label={`Foto ${i + 1} vergrößern`}
          >
            <img src={photo.url} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {lightbox !== null && (
        <PhotoLightbox
          photos={photos}
          index={lightbox}
          onChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
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
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Main image */}
      <img
        src={photos[index].url}
        alt=""
        className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition text-lg"
        aria-label="Schließen"
      >
        ✕
      </button>

      {/* Counter */}
      {photos.length > 1 && (
        <span className="absolute top-4 left-4 text-xs font-bold text-white/70 bg-black/30 px-2 py-1 rounded-full">
          {index + 1} / {photos.length}
        </span>
      )}

      {/* Prev */}
      {canPrev && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(index - 1); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition text-lg"
          aria-label="Vorheriges Foto"
        >
          ‹
        </button>
      )}

      {/* Next */}
      {canNext && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(index + 1); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition text-lg"
          aria-label="Nächstes Foto"
        >
          ›
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
              className={`w-10 h-10 rounded-lg overflow-hidden border-2 transition flex-shrink-0 ${
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
