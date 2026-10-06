// Bildmetriken (Schärfe, Belichtung, Auflösung, Duplikate) über die
// eigenen Fotos — keine KI, keine Konkurrenzdaten. Das Foto-Briefing
// (fehlende Aufnahmen je Kategorie) hängt daran, blockiert aber nichts.
import { MissingPhotoShot, PhotoShotNeed } from './photo-briefing';

export type PhotoQualityIssueType =
  | 'BLURRY'
  | 'TOO_DARK'
  | 'TOO_BRIGHT'
  | 'LOW_RESOLUTION'
  | 'DUPLICATE';

export interface PhotoQualityIssue {
  photoIndex: number;
  type: PhotoQualityIssueType;
  message: string;
}

/** Nur die Pixel-Prüfung. Das Briefing kommt getrennt dazu. */
export interface PixelPhotoCheck {
  photoCount: number;
  issues: PhotoQualityIssue[];
}

export interface PhotoQualityReport extends PixelPhotoCheck {
  category: string | null;
  requiredShots: PhotoShotNeed[];
  missingShots: MissingPhotoShot[];
}
