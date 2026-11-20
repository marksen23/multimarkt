import type { CaptureStage } from '../lib/capture-stage';
import { CAPTURE_STEPS, captureStatusText, captureStepState } from '../lib/capture-stage';

export function CaptureProgress({
  stage,
  uploadPercent = 0,
  leaveHint = false,
}: {
  stage: CaptureStage;
  uploadPercent?: number;
  leaveHint?: boolean;
}) {
  const percent = Math.max(0, Math.min(100, Math.round(uploadPercent)));
  return (
    <div role="status" aria-live="polite" className="rounded-card border border-line bg-surface p-4 space-y-3">
      <p className="text-body font-semibold text-ink">{captureStatusText(stage, percent)}</p>
      <ol className="space-y-1.5" aria-label="Fortschritt der Analyse">
        {CAPTURE_STEPS.map((step) => {
          const state = captureStepState(stage, step.id);
          return (
            <li
              key={step.id}
              aria-current={state === 'current' ? 'step' : undefined}
              className={`flex items-center gap-2 text-label ${
                state === 'pending' ? 'font-normal text-ink-faint' : 'text-ink'
              }`}
            >
              <span
                aria-hidden="true"
                className={`w-2 h-2 rounded-full shrink-0 ${
                  state === 'pending' ? 'bg-line' : state === 'current' ? 'bg-accent animate-pulse' : 'bg-accent'
                }`}
              />
              {step.label}
              {state === 'done' && <span className="sr-only">erledigt</span>}
            </li>
          );
        })}
      </ol>
      {stage === 'uploading' && (
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Upload-Fortschritt"
          className="w-full h-1.5 rounded-full bg-line overflow-hidden"
        >
          <div className="h-full bg-accent transition-all duration-150" style={{ width: `${percent}%` }} />
        </div>
      )}
      {stage === 'analyzing' && (
        <div className="w-full h-1.5 rounded-full bg-accent/30 animate-pulse" aria-hidden="true" />
      )}
      {leaveHint && stage === 'analyzing' && (
        <p className="text-label font-normal text-ink-faint">Du kannst die Seite verlassen und später wiederkommen.</p>
      )}
    </div>
  );
}
