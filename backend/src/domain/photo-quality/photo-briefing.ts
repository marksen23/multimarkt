import { canonicalCategory, ResaleCategory } from '../category/taxonomy';

/**
 * Foto-Briefing (Feature-Plan 3.11). Nach der Kategorie fehlen nur die
 * Aufnahmen, die diese Kategorie braucht. Die Liste ist ein Hinweis:
 * weder Analyse noch Listing prüfen sie, Speichern bleibt möglich.
 *
 * Reihenfolge wie im Plan: ganzes Stück, Etikett, Sohle, Defekt, Zubehör.
 * Sohle nur bei Schuhen, Zubehör nur bei Elektronik. Medien und Sonstiges
 * brauchen das Stück selbst, kein Etikett und keinen Defekt.
 */
export const PHOTO_SHOTS = ['WHOLE', 'LABEL', 'SOLE', 'DEFECT', 'ACCESSORY'] as const;

export type PhotoShot = (typeof PHOTO_SHOTS)[number];

export const PHOTO_SHOT_LABELS: Record<PhotoShot, string> = {
  WHOLE: 'Gesamtes Stück',
  LABEL: 'Etikett',
  SOLE: 'Sohle',
  DEFECT: 'Defekt',
  ACCESSORY: 'Zubehör',
};

export const CATEGORY_PHOTO_SHOTS: Record<ResaleCategory, readonly PhotoShot[]> = {
  Kleidung: ['WHOLE', 'LABEL', 'DEFECT'],
  Schuhe: ['WHOLE', 'LABEL', 'SOLE', 'DEFECT'],
  Elektronik: ['WHOLE', 'LABEL', 'DEFECT', 'ACCESSORY'],
  Medien: ['WHOLE'],
  Haushalt: ['WHOLE', 'DEFECT'],
  Möbel: ['WHOLE', 'DEFECT'],
  Sonstiges: ['WHOLE'],
};

export interface PhotoShotNeed {
  shot: PhotoShot;
  label: string;
}

export interface MissingPhotoShot extends PhotoShotNeed {
  message: string;
}

export interface PhotoBriefing {
  category: ResaleCategory | null;
  requiredShots: PhotoShotNeed[];
  missingShots: MissingPhotoShot[];
}

export interface BriefingAttribute {
  attributeKey: string;
  attributeValue: string | null;
  truthState: string;
}

export function isPhotoShot(value: string | null | undefined): value is PhotoShot {
  return PHOTO_SHOTS.includes(value as PhotoShot);
}

export function shotNeed(shot: PhotoShot): PhotoShotNeed {
  return { shot, label: PHOTO_SHOT_LABELS[shot] };
}

/** Kategorie gilt als bekannt, sobald ein kanonischer Wert nicht UNKNOWN ist. */
export function categoryForPhotoBriefing(attributes: BriefingAttribute[]): ResaleCategory | null {
  const rows = attributes.filter(
    (attribute) => attribute.attributeKey === 'category' && attribute.truthState !== 'UNKNOWN',
  );
  const confirmed = rows.find((attribute) => attribute.truthState === 'USER_CONFIRMED');
  return canonicalCategory((confirmed ?? rows[0])?.attributeValue);
}

export function buildPhotoBriefing(
  attributes: BriefingAttribute[],
  coveredShots: Iterable<string | null | undefined>,
): PhotoBriefing {
  const category = categoryForPhotoBriefing(attributes);
  if (!category) {
    return { category: null, requiredShots: [], missingShots: [] };
  }

  const covered = new Set<PhotoShot>();
  for (const shot of coveredShots) {
    if (isPhotoShot(shot)) covered.add(shot);
  }

  const requiredShots = CATEGORY_PHOTO_SHOTS[category].map(shotNeed);
  const missingShots = requiredShots
    .filter((need) => !covered.has(need.shot))
    .map((need) => ({ ...need, message: `${need.label} fehlt noch.` }));

  return { category, requiredShots, missingShots };
}
