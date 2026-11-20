import { EnhancementStatus, PhotoTip } from './photo-enhancement.types';

export interface PublishablePhotoFields {
  url: string;
  storageKey: string;
  enhancedUrl: string | null;
  enhancedStorageKey: string | null;
  enhancementStatus: EnhancementStatus | string;
  preferEnhanced: boolean;
}

export interface OrderedPhoto {
  sortOrder: number;
  createdAt: Date | string;
}

/** Reihenfolge in der Galerie, im ZIP und bei eBay. Das erste Foto ist das Titelbild. */
export function comparePhotoOrder(a: OrderedPhoto, b: OrderedPhoto): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

/**
 * Veröffentlichung nutzt die verbesserte Datei, sobald sie fertig ist und
 * der Schalter auf „Verbessert“ steht. Sonst das Original — nie eine
 * erfundene Ersatzdatei.
 */
export function publishablePhoto(photo: PublishablePhotoFields): { url: string; storageKey: string } {
  if (
    photo.preferEnhanced &&
    photo.enhancementStatus === 'ready' &&
    photo.enhancedUrl &&
    photo.enhancedStorageKey
  ) {
    return { url: photo.enhancedUrl, storageKey: photo.enhancedStorageKey };
  }
  return { url: photo.url, storageKey: photo.storageKey };
}

export interface PublicPhoto {
  id: string;
  itemId: string;
  url: string;
  shot: string | null;
  createdAt: Date | string;
  enhancedUrl: string | null;
  enhancementStatus: EnhancementStatus | string;
  preferEnhanced: boolean;
  displayUrl: string;
  tips: PhotoTip[];
  suggestedCover: boolean;
  sortOrder: number;
}

export function toPublicPhoto(
  photo: PublishablePhotoFields &
    OrderedPhoto & {
      id: string;
      itemId: string;
      shot: string | null;
      tips: PhotoTip[] | null;
      suggestedCover: boolean;
    },
): PublicPhoto {
  return {
    id: photo.id,
    itemId: photo.itemId,
    url: photo.url,
    shot: photo.shot,
    createdAt: photo.createdAt,
    enhancedUrl: photo.enhancedUrl,
    enhancementStatus: photo.enhancementStatus,
    preferEnhanced: photo.preferEnhanced,
    displayUrl: publishablePhoto(photo).url,
    tips: photo.tips ?? [],
    suggestedCover: photo.suggestedCover,
    sortOrder: photo.sortOrder,
  };
}

export function coverThumbnailUrl<T extends PublishablePhotoFields & OrderedPhoto & { itemId: string }>(
  photos: T[],
): Map<string, string> {
  const grouped = new Map<string, T[]>();
  for (const photo of photos) {
    const list = grouped.get(photo.itemId);
    if (list) list.push(photo);
    else grouped.set(photo.itemId, [photo]);
  }
  const thumbnails = new Map<string, string>();
  for (const [itemId, list] of grouped) {
    list.sort(comparePhotoOrder);
    thumbnails.set(itemId, publishablePhoto(list[0]).url);
  }
  return thumbnails;
}
