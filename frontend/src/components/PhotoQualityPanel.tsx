import { useEffect, useState } from 'react';
import { itemsApi } from '../api/items';
import type { PhotoQualityReport } from '../api/types';

/**
 * Rein technischer Hinweis (Schärfe/Belichtung/Auflösung/Duplikate) über
 * die eigenen Fotos — keine KI, keine Konkurrenzdaten. Blockiert nie das
 * Anlegen des Listings, ist nur ein Hinweis vor dem Veröffentlichen.
 */
export function PhotoQualityPanel({ itemId, photoCount }: { itemId: string; photoCount: number }) {
  const [report, setReport] = useState<PhotoQualityReport | null>(null);

  useEffect(() => {
    if (photoCount === 0) return;
    itemsApi.photoQuality(itemId).then(setReport).catch(() => setReport(null));
  }, [itemId, photoCount]);

  if (!report || report.issues.length === 0) return null;

  return (
    <div className="bg-surface border border-line rounded-xl p-3 space-y-1">
      <p className="text-xs font-bold text-ink-muted uppercase tracking-wide">Foto-Check</p>
      <ul className="space-y-1">
        {report.issues.map((issue, i) => (
          <li key={i} className="text-xs text-ink-muted">
            ⚠️ {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
