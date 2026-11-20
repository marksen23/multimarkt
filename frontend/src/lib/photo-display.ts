import type { ItemPhoto } from '../api/types';

export function shownPhotoUrl(photo: Pick<ItemPhoto, 'url' | 'displayUrl' | 'enhancedUrl' | 'preferEnhanced' | 'enhancementStatus'>): string {
  if (photo.displayUrl) return photo.displayUrl;
  if (photo.preferEnhanced !== false && photo.enhancementStatus === 'ready' && photo.enhancedUrl) {
    return photo.enhancedUrl;
  }
  return photo.url;
}

export function enhancementProgress(photos: Array<Pick<ItemPhoto, 'enhancementStatus'>>): {
  active: boolean;
  done: number;
  total: number;
  text: string | null;
} {
  const tracked = photos.filter((photo) =>
    photo.enhancementStatus === 'pending' ||
    photo.enhancementStatus === 'processing' ||
    photo.enhancementStatus === 'ready' ||
    photo.enhancementStatus === 'failed',
  );
  const done = tracked.filter((photo) => photo.enhancementStatus === 'ready' || photo.enhancementStatus === 'failed').length;
  const active = tracked.some((photo) => photo.enhancementStatus === 'pending' || photo.enhancementStatus === 'processing');
  if (!active) return { active: false, done, total: tracked.length, text: null };
  const text = tracked.length <= 1 ? 'Foto wird verbessert …' : `${done} von ${tracked.length} Fotos verbessert …`;
  return { active: true, done, total: tracked.length, text };
}

export function publishVersionHint(
  photos: Array<Pick<ItemPhoto, 'enhancementStatus' | 'enhancedUrl' | 'preferEnhanced'>>,
): string | null {
  const ready = photos.filter((photo) => photo.enhancementStatus === 'ready' && photo.enhancedUrl);
  if (ready.length === 0) return null;
  const enhanced = ready.filter((photo) => photo.preferEnhanced !== false).length;
  if (enhanced === ready.length) return 'eBay und die Kleinanzeigen-Fotos verwenden die verbesserte Version.';
  if (enhanced === 0) return 'eBay und die Kleinanzeigen-Fotos verwenden die Originale.';
  return 'eBay und die Kleinanzeigen-Fotos verwenden je Foto die gewählte Version.';
}

export function photoTipLines(photos: Array<Pick<ItemPhoto, 'tips'>>): Array<{ label: string; message: string }> {
  const lines: Array<{ label: string; message: string }> = [];
  photos.forEach((photo, index) => {
    const seen = new Set<string>();
    for (const tip of photo.tips ?? []) {
      if (!tip.message || seen.has(tip.message)) continue;
      seen.add(tip.message);
      lines.push({ label: `Foto ${index + 1}`, message: tip.message });
    }
  });
  return lines;
}

export function showingEnhanced(photo: Pick<ItemPhoto, 'preferEnhanced' | 'enhancementStatus' | 'enhancedUrl'>): boolean {
  return photo.preferEnhanced !== false && photo.enhancementStatus === 'ready' && Boolean(photo.enhancedUrl);
}
