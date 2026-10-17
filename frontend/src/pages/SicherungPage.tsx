import { useEffect, useState } from 'react';
import { ApiRequestError } from '../api/client';
import { exportApi, type MonthlySummary } from '../api/export';
import { ListSkeleton } from '../components/Skeleton';
import { formatEur } from '../margin/sale-closeout';
import { Button, Card, Icon, Notice, PageHeader, SectionLabel } from '../ui';

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
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-6">
      <PageHeader
        title="Sicherung und Monatsauswertung"
        subtitle="Eine Datei mit Artikeln, Einkäufen, Verkäufen und der Fotoliste, plus die Zahlen des Monats. Kein Steuerprogramm."
      />

      {error && <Notice tone="danger">{error}</Notice>}

      {!summary && !error && <ListSkeleton />}

      {summary && (
        <>
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => { setError(null); setSelected(shiftMonth(summary.month, -1)); }}
                aria-label="Vorheriger Monat"
                className="w-9 h-9 flex items-center justify-center rounded-control text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors"
              >
                <Icon name="chevronLeft" size={20} />
              </button>
              <h2 className="text-title text-ink capitalize">{monthLabel(summary.month)}</h2>
              <button
                type="button"
                onClick={() => { setError(null); setSelected(shiftMonth(summary.month, 1)); }}
                disabled={atCurrentMonth}
                aria-label="Nächster Monat"
                className="w-9 h-9 flex items-center justify-center rounded-control text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <Icon name="chevronRight" size={20} />
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
            <p className="text-label font-normal text-ink-faint">
              Eingekauft, verkauft und Marge gelten für {monthLabel(summary.month)}. Noch
              online zählt Artikel und Pakete, die gerade mindestens eine Online-Anzeige
              haben. Einkäufe ohne Datum fehlen in der Monatszahl.
            </p>
          </Card>

          <section>
            <SectionLabel>Sicherung</SectionLabel>
            <Card className="p-4 space-y-3">
              <p className="text-body text-ink-muted">
                Die Datei enthält Artikel, Einkäufe, Verkäufe und die Fotoliste. Die Fotos
                selbst bleiben im Speicher; die Liste nennt Verweis und Dateiname.
              </p>
              {downloadError && <Notice tone="danger">{downloadError}</Notice>}
              {downloadedName && (
                <p className="text-label font-normal text-ink">{downloadedName} wurde heruntergeladen.</p>
              )}
              <Button
                block
                size="md"
                icon="download"
                onClick={download}
                disabled={downloading}
                loading={downloading}
              >
                Sicherung herunterladen
              </Button>
            </Card>
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
    <div className="rounded-control bg-surface-hover px-3 py-3">
      <p className="text-micro uppercase text-ink-faint">{label}</p>
      <p className={`mt-1 text-title tabular-nums ${negative ? 'text-danger' : 'text-ink'}`}>
        {value}
      </p>
      <p className="text-label font-normal text-ink-muted">{caption}</p>
    </div>
  );
}
