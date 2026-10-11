import { useEffect, useState } from 'react';
import { itemsApi } from '../api/items';
import { Card } from '../ui';
import type { PhotoQualityIssue, PhotoQualityIssueType, PhotoQualityReport } from '../api/types';

/**
 * Rein technischer Hinweis (Schärfe/Belichtung/Auflösung/Duplikate) über
 * die eigenen Fotos — keine KI, keine Konkurrenzdaten. Blockiert nie das
 * Anlegen des Listings, ist nur ein Hinweis vor dem Veröffentlichen.
 */

const ISSUE_CONFIG: Record<
  PhotoQualityIssueType,
  { label: string; tip: string; critical: boolean }
> = {
  BLURRY: {
    label: 'Unscharf',
    tip: 'Kamera stabilisieren, ggf. Stativ nutzen.',
    critical: true,
  },
  TOO_DARK: {
    label: 'Zu dunkel',
    tip: 'Helleren Hintergrund oder zusätzliches Licht nutzen.',
    critical: true,
  },
  TOO_BRIGHT: {
    label: 'Überbelichtet',
    tip: 'Direktes Sonnenlicht vermeiden, indirektes Licht verwenden.',
    critical: true,
  },
  LOW_RESOLUTION: {
    label: 'Niedrige Auflösung',
    tip: 'Foto in höherer Auflösung aufnehmen.',
    critical: false,
  },
  DUPLICATE: {
    label: 'Duplikat',
    tip: 'Ähnliches Foto entfernen.',
    critical: false,
  },
};

function groupByPhoto(issues: PhotoQualityIssue[]): Map<number, PhotoQualityIssue[]> {
  const map = new Map<number, PhotoQualityIssue[]>();
  for (const issue of issues) {
    const list = map.get(issue.photoIndex) ?? [];
    list.push(issue);
    map.set(issue.photoIndex, list);
  }
  return map;
}

export function PhotoQualityPanel({ itemId, photoCount }: { itemId: string; photoCount: number }) {
  const [report, setReport] = useState<PhotoQualityReport | null>(null);

  useEffect(() => {
    if (photoCount === 0) return;
    itemsApi.photoQuality(itemId).then(setReport).catch(() => setReport(null));
  }, [itemId, photoCount]);

  if (!report || report.issues.length === 0) return null;

  const criticalCount = report.issues.filter((i) => ISSUE_CONFIG[i.type]?.critical).length;
  const byPhoto = groupByPhoto(report.issues);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <h2 className="text-micro uppercase text-ink-faint">Foto-Check</h2>
        <span
          className={`text-label tabular-nums px-2 py-0.5 rounded-full ${
            criticalCount > 0 ? 'bg-warning-soft text-warning' : 'bg-phase-archive-soft text-ink-faint'
          }`}
        >
          {report.issues.length} {report.issues.length === 1 ? 'Hinweis' : 'Hinweise'}
        </span>
      </div>

      <ul className="px-4 pb-1 divide-y divide-line">
        {Array.from(byPhoto.entries()).map(([photoIndex, issues]) => (
          <li key={photoIndex} className="py-2.5 flex gap-3">
            <p className="text-label text-ink-faint tabular-nums w-14 shrink-0">Foto {photoIndex + 1}</p>
            <ul className="min-w-0 flex-1 space-y-1.5">
              {issues.map((issue, i) => {
                const cfg = ISSUE_CONFIG[issue.type];
                return (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                        cfg?.critical ? 'bg-warning' : 'bg-ink-faint/50'
                      }`}
                      aria-hidden="true"
                    />
                    <p className="min-w-0 text-label font-normal text-ink-muted">
                      <span className={`font-semibold ${cfg?.critical ? 'text-ink' : 'text-ink-muted'}`}>
                        {cfg?.label ?? issue.type}
                      </span>
                      {' · '}
                      <span className="text-ink-faint">{cfg?.tip ?? issue.message}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <p className="px-4 py-2.5 text-label font-normal text-ink-faint border-t border-line">
        Hinweise sind rein informativ — Listing kann trotzdem erstellt werden.
      </p>
    </Card>
  );
}
