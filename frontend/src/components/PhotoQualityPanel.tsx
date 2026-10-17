import { useEffect, useState } from 'react';
import { itemsApi } from '../api/items';
import type { PhotoQualityReport } from '../api/types';
import type { PhotoBriefing } from '../category/photo-briefing';

/**
 * Foto-Check (unscharf, zu dunkel, zu klein, doppelt) plus Foto-Briefing.
 * Beides ist ein Hinweis. Fehlende Aufnahmen blockieren das Speichern nicht.
 */
export function PhotoQualityPanel({
  itemId,
  photoCount,
  briefing,
}: {
  itemId: string;
  photoCount: number;
  briefing: PhotoBriefing;
}) {
  const [report, setReport] = useState<PhotoQualityReport | null>(null);

  useEffect(() => {
    if (photoCount === 0) return;
    itemsApi.photoQuality(itemId).then(setReport).catch(() => setReport(null));
  }, [itemId, photoCount]);

  const issues = report?.issues ?? [];
  const showBriefing = briefing.category != null;
  if (issues.length === 0 && !showBriefing) return null;

  return (
    <div className="bg-surface border border-line rounded-xl p-3 space-y-3">
      {issues.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold text-ink-muted uppercase tracking-wide">Foto-Check</p>
          <ul className="space-y-1">
            {issues.map((issue, i) => (
              <li key={i} className="text-xs text-ink-muted">
                ⚠️ {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showBriefing && (
        <div className="space-y-1">
          <p className="text-xs font-bold text-ink-muted uppercase tracking-wide">Foto-Briefing</p>
          {briefing.missingShots.length === 0 ? (
            <p className="text-xs text-ink-muted">Für {briefing.category} sind alle Aufnahmen da.</p>
          ) : (
            <>
              <p className="text-xs text-ink-muted">
                Für {briefing.category} fehlt noch. Speichern bleibt möglich.
              </p>
              <ul className="space-y-1">
                {briefing.missingShots.map((shot) => (
                  <li key={shot.shot} className="text-xs text-ink">
                    {shot.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
