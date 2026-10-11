export type Phase = 'capture' | 'review' | 'ready' | 'live' | 'done' | 'conflict' | 'archive';

export const WORKFLOW_PHASES: { phase: Phase; label: string }[] = [
  { phase: 'capture', label: 'Erfassen' },
  { phase: 'review', label: 'Prüfen' },
  { phase: 'ready', label: 'Inserieren' },
  { phase: 'live', label: 'Online' },
  { phase: 'done', label: 'Verkauft' },
];

const STATUS: Record<string, { phase: Phase; label: string; busy?: boolean }> = {
  NEW: { phase: 'capture', label: 'Neu' },
  ANALYZING: { phase: 'capture', label: 'Analysiert…', busy: true },
  REVIEW_REQUIRED: { phase: 'review', label: 'Zu prüfen' },
  READY: { phase: 'ready', label: 'Bereit' },
  BUNDLED: { phase: 'live', label: 'Im Bundle' },
  LISTED: { phase: 'live', label: 'Online' },
  SOLD: { phase: 'done', label: 'Verkauft' },
  SALE_CONFLICT: { phase: 'conflict', label: 'Konflikt' },
  CANCELLED: { phase: 'archive', label: 'Storniert' },
  ARCHIVED: { phase: 'archive', label: 'Archiviert' },
  DRAFT: { phase: 'capture', label: 'Entwurf' },
  PUBLISHING: { phase: 'capture', label: 'Wird veröffentlicht', busy: true },
  ONLINE: { phase: 'live', label: 'Online' },
  CANCEL_PENDING: { phase: 'review', label: 'Storno läuft', busy: true },
};

export function statusInfo(status: string) {
  return STATUS[status] ?? { phase: 'archive' as Phase, label: status };
}

export const PHASE_BADGE: Record<Phase, string> = {
  capture: 'bg-phase-capture-soft text-phase-capture',
  review: 'bg-phase-review-soft text-phase-review',
  ready: 'bg-phase-ready-soft text-phase-ready',
  live: 'bg-phase-live-soft text-phase-live',
  done: 'bg-phase-done text-phase-done-ink',
  conflict: 'bg-danger-soft text-danger',
  archive: 'bg-phase-archive-soft text-phase-archive',
};

export const PHASE_BORDER: Record<Phase, string> = {
  capture: 'border-line',
  review: 'border-phase-review/50',
  ready: 'border-phase-ready/50',
  live: 'border-line',
  done: 'border-line',
  conflict: 'border-danger/50',
  archive: 'border-line',
};

/** Was der Nutzer als Nächstes tun soll — Basis für „Heute“ und die ActionBar. */
export const NEXT_STEP: Partial<Record<string, { label: string; urgency: number }>> = {
  SALE_CONFLICT: { label: 'Konflikt lösen', urgency: 0 },
  REVIEW_REQUIRED: { label: 'Angaben prüfen', urgency: 1 },
  READY: { label: 'Inserieren', urgency: 2 },
  NEW: { label: 'Fotos hinzufügen', urgency: 3 },
  ANALYZING: { label: 'Analyse läuft', urgency: 4 },
  LISTED: { label: 'Verkauft?', urgency: 5 },
};
