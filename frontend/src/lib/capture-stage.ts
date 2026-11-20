export type CaptureStage = 'creating' | 'uploading' | 'analyzing';

export const CAPTURE_STEPS: { id: CaptureStage; label: string }[] = [
  { id: 'creating', label: 'Artikel anlegen' },
  { id: 'uploading', label: 'Fotos hochladen' },
  { id: 'analyzing', label: 'KI liest die Fotos' },
];

export function captureStepState(stage: CaptureStage, step: CaptureStage): 'done' | 'current' | 'pending' {
  const current = CAPTURE_STEPS.findIndex((entry) => entry.id === stage);
  const index = CAPTURE_STEPS.findIndex((entry) => entry.id === step);
  if (index < current) return 'done';
  if (index === current) return 'current';
  return 'pending';
}

export function captureStatusText(stage: CaptureStage, uploadPercent: number): string {
  if (stage === 'creating') return 'Artikel wird angelegt.';
  if (stage === 'uploading') return `Fotos werden hochgeladen, ${Math.round(uploadPercent)} Prozent.`;
  return 'Die KI liest die Fotos. Das dauert meist unter einer Minute.';
}
