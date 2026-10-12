import { Icon } from './Icon';
import { PHASE_BADGE, WORKFLOW_PHASES, statusInfo } from './phase';

export function PhaseBadge({ status, className }: { status: string; className?: string }) {
  const { phase, label, busy } = statusInfo(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-micro uppercase whitespace-nowrap ${PHASE_BADGE[phase]} ${className ?? ''}`}
    >
      {busy && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" aria-hidden="true" />}
      {phase === 'done' && <Icon name="check" size={12} strokeWidth={3} />}
      {label}
    </span>
  );
}

/** Fünf-Schritt-Fortschritt eines Artikels. Konflikt/Archiv/Bundle haben keinen linearen Platz und blenden ihn aus. */
export function PhaseStepper({ status }: { status: string }) {
  const { phase } = statusInfo(status);
  const current = WORKFLOW_PHASES.findIndex((p) => p.phase === phase);
  if (current === -1 || status === 'BUNDLED') return null;

  return (
    <ol className="flex items-center gap-1" aria-label="Fortschritt">
      {WORKFLOW_PHASES.map((p, i) => {
        const done = i < current || phase === 'done';
        const active = i === current && phase !== 'done';
        return (
          <li key={p.phase} className="flex-1 min-w-0" aria-current={active ? 'step' : undefined}>
            <div
              className={`h-1 rounded-full transition-colors ${
                done ? 'bg-accent' : active ? 'bg-accent/50' : 'bg-line'
              }`}
            />
            <p
              className={`mt-1.5 text-micro truncate ${
                active ? 'text-ink' : done ? 'text-accent' : 'text-ink-faint'
              }`}
            >
              {p.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
