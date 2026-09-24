import type { ItemPhoto } from '../api/types';

/**
 * Fotogalerie pro Artikel (September 2026) — zeigt die dauerhaft mit dem
 * Item verknüpften Fotos (backend/src/infrastructure/database/entities/
 * item-photo.entity.ts). Unabhängig vom Item-Status sichtbar, nicht nur
 * während des Analyse-Schritts.
 */
export function PhotoGallery({ photos }: { photos: ItemPhoto[] }) {
  if (photos.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((photo) => (
        <a
          key={photo.id}
          href={photo.url}
          target="_blank"
          rel="noreferrer"
          className="aspect-square rounded-lg overflow-hidden border border-gray-200 block"
        >
          <img src={photo.url} alt="" className="w-full h-full object-cover" />
        </a>
      ))}
    </div>
  );
}
