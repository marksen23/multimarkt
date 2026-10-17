import { useEffect, useState } from 'react';
import { ApiRequestError } from '../api/client';
import { exportApi, type MonthlySummary } from '../api/export';
import { ListSkeleton } from '../components/Skeleton';
import { formatEur } from '../margin/sale-closeout';

function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${nextYear}-${nextMonth}`;
}

function monthLabel(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleDateString('de-DE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function SicherungPage() {
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadedName, setDownloadedName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    exportApi
      .month(selected)
      .then((next) => {
        if (!active) return;
        setError(null);
        setSummary(next);
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
      });
    return () => {
      active = false;
    };
  }, [selected]);

  const download = async () => {
    setDownloading(true);
    setDownloadError(null);
    setDownloadedName(null);
    try {
      const file = await exportApi.download();
      const filename = file.filename ?? 'sicherung.json';
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDownloadedName(filename);
    } catch (e) {
      setDownloadError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
    } finally {
      setDownloading(false);
    }
  };

  const atCurrentMonth = summary != null && summary.month >= summary.currentMonth;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-ink tracking-tight">
          Sicherung und Monatsauswertung
        </h1>
        <p className="text-xs text-ink-muted mt-1">
          Eine Datei mit Artikeln, Einkäufen, Verkäufen und der Fotoliste, plus die
          Zahlen des Monats. Kein Steuerprogramm.
        </p>
      </div>

      {error && (
        <div className="bg-danger-soft border border-danger/20 rounded-xl p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {!summary && !error && <ListSkeleton />}

      {summary && (
        <>
          <section className="bg-surface border border-line rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSelected(shiftMonth(summary.month, -1));
                }}
                className="px-3 py-1.5 rounded-full text-xs font-semibold text-ink-muted hover:bg-surface-hover"
                aria-label="Vorheriger Monat"
              >
                Zurück
              </button>
              <h2 className="text-sm font-bold text-ink capitalize">{monthLabel(summary.month)}</h2>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSelected(shiftMonth(summary.month, 1));
                }}
                disabled={atCurrentMonth}
                className="px-3 py-1.5 rounded-full text-xs font-semibold text-ink-muted hover:bg-surface-hover disabled:text-ink-faint disabled:hover:bg-transparent"
                aria-label="Nächster Monat"
              >
                Weiter
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Figure
                label="Eingekauft"
                value={formatEur(summary.purchasedEur)}
                caption={
                  summary.purchasedEur == null
                    ? `${countLabel(summary.purchasedCount, 'Einkauf', 'Einkäufe')}, Betrag fehlt`
                    : countLabel(summary.purchasedCount, 'Einkauf', 'Einkäufe')
                }
              />
              <Figure
                label="Verkauft"
                value={formatEur(summary.soldEur)}
                caption={
                  summary.soldEur == null
                    ? `${countLabel(summary.soldCount, 'Verkauf', 'Verkäufe')}, Betrag fehlt`
                    : countLabel(summary.soldCount, 'Verkauf', 'Verkäufe')
                }
              />
              <Figure
                label="Marge"
                value={formatEur(summary.marginEur)}
                caption="Nettogewinn"
                negative={summary.marginEur != null && summary.marginEur < 0}
              />
              <Figure
                label="Noch online"
                value={String(summary.onlineCount)}
                caption="jetzt"
              />
            </div>
            <p className="text-[11px] text-ink-faint">
              Eingekauft, verkauft und Marge gelten für {monthLabel(summary.month)}. Noch
              online zählt Artikel und Pakete, die gerade mindestens eine Online-Anzeige
              haben. Einkäufe ohne Datum fehlen in der Monatszahl.
            </p>
          </section>

          <section className="bg-surface border border-line rounded-2xl p-4 space-y-3">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">
              Sicherung
            </h2>
            <p className="text-sm text-ink-muted">
              Die Datei enthält Artikel, Einkäufe, Verkäufe und die Fotoliste. Die Fotos
              selbst bleiben im Speicher; die Liste nennt Verweis und Dateiname.
            </p>
            {downloadError && <p className="text-xs font-bold text-danger">{downloadError}</p>}
            {downloadedName && (
              <p className="text-xs text-ink">{downloadedName} wird heruntergeladen.</p>
            )}
            <button
              type="button"
              onClick={download}
              disabled={downloading}
              className="w-full p-3 rounded-xl font-bold bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
            >
              {downloading ? 'Lädt…' : 'Sicherung herunterladen'}
            </button>
          </section>
        </>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  caption,
  negative = false,
}: {
  label: string;
  value: string;
  caption: string;
  negative?: boolean;
}) {
  return (
    <div className="rounded-xl bg-surface-hover px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`mt-1 text-lg font-extrabold tabular-nums ${negative ? 'text-danger' : 'text-ink'}`}>
        {value}
      </p>
      <p className="text-[11px] text-ink-muted">{caption}</p>
    </div>
  );
}
