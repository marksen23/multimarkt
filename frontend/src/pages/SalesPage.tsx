import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiRequestError } from '../api/client';
import { salesApi, type SalesOverview, type SalesPeriod, type SoldSaleItem } from '../api/sales';
import { ListSkeleton } from '../components/Skeleton';
import { formatEuro } from '../lib/format';
import { dac7Line, profitHint, SALES_PERIODS } from '../sales/report';
import { Button, Card, EmptyState, Icon, Notice, PageHeader, SectionLabel } from '../ui';

function money(value: number | null | undefined): string {
  return value == null ? '—' : formatEuro(value);
}

function formatDay(iso: string | null): string {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return '—';
  return `${day}.${month}.${year}`;
}

function formatDays(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

function itemTitle(title: string | null, id: string): string {
  return title ?? `Artikel ${id.slice(0, 8)}`;
}

export function SalesPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<SalesPeriod>('this_month');
  const [overview, setOverview] = useState<SalesOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    salesApi
      .overview(period)
      .then((next) => {
        if (!active) return;
        setError(null);
        setOverview(next);
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
      });
    return () => {
      active = false;
    };
  }, [period]);

  const download = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const file = await salesApi.csv(period);
      const filename = file.filename ?? 'verkaeufe.csv';
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
    } finally {
      setDownloading(false);
    }
  };

  const hint = overview ? profitHint(overview.kpis) : null;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label="Zurück"
        className="inline-flex items-center gap-1 h-10 pl-1 pr-3 -ml-1 rounded-full text-body text-ink-muted hover:bg-surface-hover hover:text-ink sm:hidden"
      >
        <Icon name="chevronLeft" size={20} />
        Mehr
      </button>
      <PageHeader
        title="Verkäufe & Gewinn"
        subtitle="Erlös, Kosten und Gewinn für deine Unterlagen. Keine Steuerberatung."
        action={
          <Button
            variant="secondary"
            size="sm"
            icon="download"
            loading={downloading}
            disabled={!overview || downloading}
            onClick={() => void download()}
          >
            CSV
          </Button>
        }
      />

      <div role="tablist" aria-label="Zeitraum" className="flex gap-1 overflow-x-auto">
        {SALES_PERIODS.map((option) => {
          const selected = period === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setPeriod(option.id)}
              className={`shrink-0 h-9 px-3 rounded-full text-label transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                selected ? 'bg-accent text-accent-ink font-semibold' : 'bg-surface text-ink-muted border border-line hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {downloadError && <Notice tone="danger">{downloadError}</Notice>}
      {!overview && !error && <ListSkeleton />}

      {overview && (
        <>
          <p className="text-label font-normal text-ink-faint">
            {overview.from && overview.to
              ? `${formatDay(overview.from)}–${formatDay(overview.to)}`
              : 'Alle erfassten Verkäufe'}
          </p>

          <section aria-label="Kennzahlen">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Kpi label="Anzahl Verkäufe" value={String(overview.kpis.salesCount)} />
              <Kpi label="Gesamterlös" value={money(overview.kpis.proceedsEur)} />
              <Kpi label="Gebühren & Versand" value={money(overview.kpis.feesAndShippingEur)} />
              <Kpi
                label="Einkaufskosten"
                value={money(overview.kpis.purchaseCostEur)}
                hint={
                  overview.kpis.purchaseMissingCount > 0
                    ? `${overview.kpis.purchaseRecordedCount} erfasst`
                    : undefined
                }
              />
              <Kpi
                label="Netto-Gewinn"
                value={money(overview.kpis.netProfitEur)}
                negative={overview.kpis.netProfitEur != null && overview.kpis.netProfitEur < 0}
              />
              <Kpi
                label="Ø Verkaufsdauer"
                value={overview.kpis.averageDaysToSale == null ? '—' : `${formatDays(overview.kpis.averageDaysToSale)} Tage`}
                hint="von der Erfassung bis zum Verkauf"
              />
            </div>
            {hint && <p className="text-label font-normal text-ink-muted mt-2">{hint}</p>}
            {overview.kpis.proceedsMissingCount > 0 && (
              <p className="text-label font-normal text-ink-muted mt-1">
                Bei {overview.kpis.proceedsMissingCount}{' '}
                {overview.kpis.proceedsMissingCount === 1 ? 'Verkauf' : 'Verkäufen'} fehlt der Verkaufspreis.
              </p>
            )}
          </section>

          <ChannelSection channels={overview.channels} />
          <Dac7Section year={overview.year} rows={overview.dac7} />
          <SalesList items={overview.items} />
          <p className="text-label font-normal text-ink-faint">
            Die CSV nutzt Semikolon und Dezimalkomma und öffnet in Excel.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  negative,
}: {
  label: string;
  value: string;
  hint?: string;
  negative?: boolean;
}) {
  return (
    <Card className="p-3">
      <p className="text-micro uppercase text-ink-faint">{label}</p>
      <p className={`text-title tabular-nums mt-1 ${negative ? 'text-danger' : 'text-ink'}`}>{value}</p>
      {hint && <p className="text-micro text-ink-faint mt-1">{hint}</p>}
    </Card>
  );
}

function ChannelSection({ channels }: { channels: SalesOverview['channels'] }) {
  if (channels.length === 0) return null;
  return (
    <section aria-label="Nach Kanal">
      <SectionLabel>Nach Kanal</SectionLabel>
      <Card className="p-4 overflow-x-auto">
          <table className="w-full text-body">
            <caption className="sr-only">Verkäufe nach Kanal</caption>
            <thead>
              <tr className="text-left text-micro uppercase text-ink-faint">
                <th className="py-2 pr-3">Kanal</th>
                <th className="py-2 pr-3 text-right">Zahl</th>
                <th className="py-2 pr-3 text-right">Erlös</th>
                <th className="py-2 pr-3 text-right">Geb. & Versand</th>
                <th className="py-2 text-right">Gewinn</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr key={channel.channel} className="border-t border-line">
                  <td className="py-2 pr-3 text-ink">{channel.channel}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink">{channel.salesCount}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink">{money(channel.proceedsEur)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink">{money(channel.feesAndShippingEur)}</td>
                  <td
                    className={`py-2 text-right tabular-nums font-bold ${
                      channel.netProfitEur != null && channel.netProfitEur < 0 ? 'text-danger' : 'text-ink'
                    }`}
                  >
                    {money(channel.netProfitEur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
    </section>
  );
}

function Dac7Section({ year, rows }: { year: number; rows: SalesOverview['dac7'] }) {
  return (
    <section aria-label="Plattform-Zähler">
      <Card className="p-4 space-y-3">
        <div>
          <p className="text-micro uppercase text-ink-faint">Plattform-Zähler {year}</p>
          <p className="text-label font-normal text-ink-muted mt-1">
            Manche Plattformen melden Verkäufe, wenn auf derselben Plattform im Kalenderjahr 30 Verkäufe
            oder 2.000 € Erlös zusammenkommen. Der Zähler gilt immer für das laufende Kalenderjahr, nicht
            für den Zeitraum oben. Er zählt nur, was du hier erfasst hast — keine Steuerberatung und keine Meldung.
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="text-body text-ink">Im Kalenderjahr {year} ist noch kein Verkauf mit Datum erfasst.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.channel} className="text-body text-ink">
                {dac7Line(row)}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function SalesList({ items }: { items: SoldSaleItem[] }) {
  return (
    <section aria-label="Verkaufte Artikel">
      <SectionLabel>Verkäufe ({items.length})</SectionLabel>
      {items.length === 0 ? (
        <EmptyState icon="euro" title="In diesem Zeitraum nichts verkauft." />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <SaleCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SaleCard({ item }: { item: SoldSaleItem }) {
  const negative = item.netProfitEur != null && item.netProfitEur < 0;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <Link to={`/items/${item.id}`} className="text-body font-bold text-ink hover:text-accent min-w-0">
          {itemTitle(item.title, item.id)}
        </Link>
        <span className={`shrink-0 text-body font-bold tabular-nums ${negative ? 'text-danger' : 'text-ink'}`}>
          {money(item.netProfitEur)}
        </span>
      </div>
      <p className="text-label font-normal text-ink-muted mt-1">
        {item.channel} · {formatDay(item.saleDate)}
      </p>
      <p className="text-label font-normal text-ink mt-2 tabular-nums">
        Einkauf {money(item.purchasePriceEur)} · Verkauf {money(item.proceedsEur)} · Gebühren {money(item.feeEur)} · Versand{' '}
        {money(item.shippingEur)}
      </p>
      {(item.buyer || item.notes) && (
        <p className="text-label font-normal text-ink-muted mt-1">
          {[item.buyer, item.notes].filter(Boolean).join(' · ')}
        </p>
      )}
    </Card>
  );
}
