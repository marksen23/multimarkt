// Rein technische Bildmetriken (Schärfe, Belichtung, Auflösung, Duplikate)
// über die EIGENEN hochgeladenen Fotos — keine KI, keine Konkurrenzdaten,
// keine Aussage über das Produkt selbst. Deshalb kein swappable Provider
// (nichts zu mocken, es ist reine, deterministische Pixel-Mathematik) und
// keine Kategorie-Pflichtwinkel-Prüfung (dafür gibt es noch kein
// Kategorie-Schema im Projekt — siehe docs §9c, bislang nicht gebaut).
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

export interface PhotoQualityReport {
  photoCount: number;
  issues: PhotoQualityIssue[];
}
