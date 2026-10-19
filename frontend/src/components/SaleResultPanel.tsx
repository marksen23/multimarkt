import { Link } from 'react-router-dom';
import type { Item } from '../api/types';
import { computeSaleCloseout, formatEur, type SaleCloseoutDraft } from '../margin/sale-closeout';
import { Card, Icon } from '../ui';
import { SaleCloseoutForm } from './SaleCloseoutForm';

function formatSoldAt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function SaleResultPanel({
  item,
  busy,
  onRecord,
}: {
  item: Item;
  busy: boolean;
  onRecord: (draft: SaleCloseoutDraft) => Promise<void>;
}) {
  if (item.saleProceedsEur == null) {
    return (
      <Card className="p-4 space-y-3">
        <div>
          <p className="text-micro uppercase text-ink-faint">Verkaufsabschluss</p>
          <p className="text-label font-normal text-ink-faint mt-1">
            Der Artikel ist verkauft. Erlös, Portal, Gebühren und Versand fehlen noch.
          </p>
        </div>
        <SaleCloseoutForm
          initialProceeds={null}
          initialPortal="Kleinanzeigen"
          purchasePriceEur={item.purchasePriceEur}
          showProfit
          busy={busy}
          submitLabel="Abschluss speichern"
          onSubmit={(draft) => void onRecord(draft)}
        />
      </Card>
    );
  }

  const result = computeSaleCloseout({
    proceedsEur: item.saleProceedsEur,
    feeEur: item.saleFeeEur ?? 0,
    shippingEur: item.saleShippingEur ?? 0,
    purchasePriceEur: item.salePurchasePriceEur,
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-micro uppercase text-ink-faint">Verkaufsabschluss</p>
        <p className="text-label font-normal text-ink-faint">{formatSoldAt(item.soldAt)}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-body">
        <Figure label="Erlös" value={formatEur(item.saleProceedsEur)} />
        <Figure label="Portal" value={item.salePortal ?? '—'} />
        <Figure label="Gebühren" value={formatEur(item.saleFeeEur)} />
        <Figure label="Versand" value={formatEur(item.saleShippingEur)} />
        <Figure label="Zahlungsweg" value={item.salePaymentMethod ?? '—'} />
        <Figure label="Einstand" value={formatEur(item.salePurchasePriceEur)} />
        <Figure label="Netto" value={formatEur(result.netEur)} />
        <Figure
          label="Nettogewinn"
          value={
            result.netProfitEur == null
              ? '—'
              : result.marginPercent == null
                ? formatEur(result.netProfitEur)
                : `${formatEur(result.netProfitEur)} (${result.marginPercent.toFixed(2)} %)`
          }
          emphasis
          negative={result.netProfitEur != null && result.netProfitEur < 0}
        />
      </dl>
      {result.netProfitEur == null && (
        <p className="text-label font-normal text-ink-muted">Einstand fehlt — Nettogewinn ist nicht gerechnet.</p>
      )}
      <p className="text-label font-normal text-ink-faint">Nettogewinn = Erlös − Gebühren − Versand − Einstand.</p>
      <Link to="/verkaeufe" className="inline-flex items-center gap-1 text-label text-accent hover:text-accent-hover transition-colors">
        Zur Verkaufsliste
        <Icon name="chevronRight" size={14} />
      </Link>
    </Card>
  );
}

function Figure({
  label,
  value,
  emphasis,
  negative,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  negative?: boolean;
}) {
  return (
    <div>
      <dt className="text-micro uppercase text-ink-faint">{label}</dt>
      <dd className={emphasis ? `font-bold ${negative ? 'text-danger' : 'text-ink'}` : 'text-ink'}>{value}</dd>
    </div>
  );
}
