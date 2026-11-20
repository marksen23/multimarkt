import { useEffect, useState } from 'react';
import { systemApi } from '../api/system';
import type { IntegrationStatus } from '../api/types';
import { ListSkeleton } from '../components/Skeleton';
import { setupOpenCount, setupRows, type SetupState } from '../lib/setup-status';
import { Card, Icon, Notice, PageHeader } from '../ui';

const PILL: Record<SetupState, string> = {
  ready: 'bg-accent-soft text-accent',
  missing: 'bg-warning-soft text-warning',
  info: 'bg-surface-hover text-ink-muted',
};

export function EinrichtungPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    systemApi
      .integrations()
      .then((next) => {
        if (active) setStatus(next);
      })
      .catch(() => {
        if (active) setError('Der Status ist gerade nicht erreichbar.');
      });
    return () => {
      active = false;
    };
  }, []);

  const rows = status ? setupRows(status) : [];
  const open = setupOpenCount(rows);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-4">
      <PageHeader
        title="Einrichtung"
        subtitle={
          error
            ? undefined
            : status
              ? open === 0
                ? 'Alles Nötige ist gesetzt.'
                : open === 1
                  ? 'Ein Punkt ist noch offen. Solange etwas fehlt, erfindet die App keine Daten.'
                  : `${open} Punkte sind noch offen. Solange etwas fehlt, erfindet die App keine Daten.`
              : 'Lädt…'
        }
      />

      {error && <Notice tone="danger">{error}</Notice>}
      {status === null && !error && <ListSkeleton count={3} />}

      {rows.length > 0 && (
        <ul className="space-y-3" aria-label="Integrationen">
          {rows.map((row) => (
            <li key={row.id}>
              <Card className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-title text-ink">{row.title}</h2>
                  <span className={`shrink-0 inline-flex items-center h-6 px-2 rounded-full text-micro normal-case tracking-normal ${PILL[row.state]}`}>
                    {row.stateLabel}
                  </span>
                </div>
                <p className="text-body text-ink-muted">{row.summary}</p>
                <p className="text-label font-normal text-ink-faint">{row.detail}</p>
                {row.missing.length > 0 && (
                  <ul className="space-y-2">
                    {row.missing.map((line) => (
                      <li key={line} className="text-label font-normal text-ink-muted">
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
                {row.href && row.linkLabel && (
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-label text-accent"
                  >
                    {row.linkLabel}
                    <Icon name="external" size={13} />
                  </a>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="text-label font-normal text-ink-faint">
        Schlüssel und Richtlinien trägst du in Coolify bei der App unter Environment Variables ein, nicht ins Git. Danach die App neu starten.
      </p>
    </div>
  );
}
