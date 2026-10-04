import { useEffect, useState } from 'react';
import { itemsApi } from '../api/items';
import type { PhotoQualityIssue, PhotoQualityIssueType, PhotoQualityReport } from '../api/types';

/**
 * Rein technischer Hinweis (Schärfe/Belichtung/Auflösung/Duplikate) über
 * die eigenen Fotos — keine KI, keine Konkurrenzdaten. Blockiert nie das
 * Anlegen des Listings, ist nur ein Hinweis vor dem Veröffentlichen.
 */

const ISSUE_CONFIG: Record<
  PhotoQualityIssueType,
  { icon: string; label: string; tip: string; critical: boolean }
> = {
  BLURRY: {
    icon: '◎',
    label: 'Unscharf',
    tip: 'Kamera stabilisieren, ggf. Stativ nutzen.',
    critical: true,
  },
  TOO_DARK: {
    icon: '◑',
    label: 'Zu dunkel',
    tip: 'Helleren Hintergrund oder zusätzliches Licht nutzen.',
    critical: true,
  },
  TOO_BRIGHT: {
    icon: '○',
    label: 'Überbelichtet',
    tip: 'Direktes Sonnenlicht vermeiden, indirektes Licht verwenden.',
    critical: true,
  },
  LOW_RESOLUTION: {
    icon: '▢',
    label: 'Niedrige Auflösung',
    tip: 'Foto in höherer Auflösung aufnehmen.',
    critical: false,
  },
  DUPLICATE: {
    icon: '⊟',
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
    <div className="bg-surface border border-line rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-b border-line ${
          criticalCount > 0 ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-surface-hover'
        }`}
      >
        <p className="text-xs font-bold text-ink-muted uppercase tracking-wide">Foto-Check</p>
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
            criticalCount > 0
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
              : 'bg-surface text-ink-faint border border-line'
          }`}
        >
          {report.issues.length} {report.issues.length === 1 ? 'Hinweis' : 'Hinweise'}
        </span>
      </div>

      {/* Issues grouped by photo */}
      <div className="divide-y divide-line">
        {Array.from(byPhoto.entries()).map(([photoIndex, issues]) => (
          <div key={photoIndex} className="p-3 space-y-1.5">
            <p className="text-[11px] font-bold text-ink-faint">Foto {photoIndex + 1}</p>
            {issues.map((issue, i) => {
              const cfg = ISSUE_CONFIG[issue.type];
              return (
                <div key={i} className="flex items-start gap-2">
                  <span
                    className={`text-sm flex-shrink-0 mt-0.5 ${
                      cfg?.critical ? 'text-amber-600 dark:text-amber-400' : 'text-ink-faint'
                    }`}
                    aria-hidden="true"
                  >
                    {cfg?.icon ?? '⚠'}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-xs font-bold ${cfg?.critical ? 'text-ink' : 'text-ink-muted'}`}>
                      {cfg?.label ?? issue.type}
                    </p>
                    <p className="text-[11px] text-ink-faint leading-snug">{cfg?.tip ?? issue.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p className="px-3 py-2 text-[11px] text-ink-faint border-t border-line">
        Hinweise sind rein informativ — Listing kann trotzdem erstellt werden.
      </p>
    </div>
  );
}
