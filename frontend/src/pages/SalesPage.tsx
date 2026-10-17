import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiRequestError } from "../api/client";
import { followUpsApi, type FollowUpCard } from "../api/follow-ups";
import {
  salesApi,
  type OpenSaleItem,
  type SalesWeek,
  type SoldSaleItem,
} from "../api/sales";
import { ListSkeleton } from "../components/Skeleton";
import {
  Card,
  EmptyState,
  Icon,
  Notice,
  PageHeader,
  PhaseBadge,
  SectionLabel,
  type IconName,
} from "../ui";
import { formatEur } from "../margin/sale-closeout";

function itemTitle(title: string | null, id: string): string {
  return title ?? `Artikel ${id.slice(0, 8)}`;
}

function weekLabel(week: SalesWeek): string {
  const start =
    week.weekStart.slice(8, 10) + "." + week.weekStart.slice(5, 7) + ".";
  const end = week.weekEnd.slice(8, 10) + "." + week.weekEnd.slice(5, 7) + ".";
  return `${start}–${end}`;
}

function soldDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE");
}

export function SalesPage() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<Awaited<
    ReturnType<typeof salesApi.overview>
  > | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    salesApi
      .overview()
      .then(setOverview)
      .catch((e) =>
        setError(
          e instanceof ApiRequestError ? e.body.message : "Unbekannter Fehler",
        ),
      );
    followUpsApi
      .list()
      .then(setFollowUps)
      .catch((e) =>
        setError(
          e instanceof ApiRequestError ? e.body.message : "Unbekannter Fehler",
        ),
      );
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 h-10 pl-1 pr-3 -ml-1 rounded-full text-body text-ink-muted hover:bg-surface-hover hover:text-ink"
      >
        <Icon name="chevronLeft" size={20} />
        Mehr
      </button>
      <PageHeader
        title="Verkäufe"
        subtitle="Offene Artikel, abgeschlossene Verkäufe und die Marge der letzten Wochen."
      />

      {error && <Notice tone="danger">{error}</Notice>}

      {!overview && !error && <ListSkeleton />}

      {overview && (
        <>
          {followUps.length > 0 && <FollowUpSection followUps={followUps} />}

          {overview.weeks.length > 0 && (
            <section>
              <SectionLabel>Marge der letzten Wochen</SectionLabel>
              <Card className="p-4 overflow-x-auto">
                <table className="w-full text-body">
                  <thead>
                    <tr className="text-left text-micro uppercase text-ink-faint">
                      <th className="py-2 pr-3">Woche</th>
                      <th className="py-2 pr-3 text-right">Verkäufe</th>
                      <th className="py-2 text-right">Marge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.weeks.map((week) => (
                      <tr key={week.weekStart} className="border-t border-line">
                        <td className="py-2 pr-3 text-ink">{weekLabel(week)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-ink">
                          {week.salesCount}
                        </td>
                        <td
                          className={`py-2 text-right tabular-nums font-bold ${
                            week.netProfitEur != null && week.netProfitEur < 0
                              ? "text-danger"
                              : "text-ink"
                          }`}
                        >
                          {formatEur(week.netProfitEur)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>
          )}

          <ItemTable
            title={`Offen (${overview.openItems.length})`}
            empty="Keine offenen Artikel."
            emptyIcon="tag"
            isEmpty={overview.openItems.length === 0}
          >
            <table className="w-full text-body">
              <thead>
                <tr className="text-left text-micro uppercase text-ink-faint">
                  <th className="py-2 pr-3">Artikel</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Einstand</th>
                  <th className="py-2 text-right">Preis</th>
                </tr>
              </thead>
              <tbody>
                {overview.openItems.map((item) => (
                  <OpenRow
                    key={item.id}
                    item={item}
                    followUp={
                      followUps.find((card) => card.itemId === item.id) ?? null
                    }
                  />
                ))}
              </tbody>
            </table>
          </ItemTable>

          <ItemTable
            title={`Verkauft (${overview.soldItems.length})`}
            empty="Noch nichts verkauft."
            emptyIcon="euro"
            isEmpty={overview.soldItems.length === 0}
          >
            <table className="w-full text-body">
              <thead>
                <tr className="text-left text-micro uppercase text-ink-faint">
                  <th className="py-2 pr-3">Artikel</th>
                  <th className="py-2 pr-3">Datum</th>
                  <th className="py-2 pr-3">Portal</th>
                  <th className="py-2 pr-3 text-right">Erlös</th>
                  <th className="py-2 pr-3 text-right">Gebühr</th>
                  <th className="py-2 pr-3 text-right">Versand</th>
                  <th className="py-2 text-right">Nettogewinn</th>
                </tr>
              </thead>
              <tbody>
                {overview.soldItems.map((item) => (
                  <SoldRow key={item.id} item={item} />
                ))}
              </tbody>
            </table>
          </ItemTable>
        </>
      )}
    </div>
  );
}

function ItemTable({
  title,
  empty,
  emptyIcon,
  isEmpty,
  children,
}: {
  title: string;
  empty: string;
  emptyIcon: IconName;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      <SectionLabel>{title}</SectionLabel>
      {isEmpty ? (
        <EmptyState icon={emptyIcon} title={empty} />
      ) : (
        <Card className="p-4 overflow-x-auto">{children}</Card>
      )}
    </section>
  );
}

function FollowUpSection({ followUps }: { followUps: FollowUpCard[] }) {
  return (
    <section>
      <SectionLabel>Nachfassen ({followUps.length})</SectionLabel>
      {followUps.length === 0 ? (
        <EmptyState
          icon="check"
          title="Keine Anzeige, die seit 7 oder 14 Tagen online ist."
        />
      ) : (
        <Card className="p-4">
          <ul className="space-y-3">
            {followUps.map((card) => (
              <li
                key={card.listingId}
                className="border-t border-line pt-3 first:border-t-0 first:pt-0"
              >
                <Link
                  to={`/items/${card.itemId}`}
                  className="text-body font-bold text-ink hover:text-accent"
                >
                  {itemTitle(card.title, card.itemId)}
                </Link>
                <p className="text-label font-normal text-ink-muted mt-1">
                  {card.headline}
                </p>
                <p className="text-label font-normal text-ink mt-1 tabular-nums">
                  {formatEur(card.currentPrice)} →{" "}
                  {formatEur(card.suggestedPrice)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function OpenRow({
  item,
  followUp,
}: {
  item: OpenSaleItem;
  followUp: FollowUpCard | null;
}) {
  return (
    <tr className="border-t border-line">
      <td className="py-2 pr-3">
        <Link
          to={`/items/${item.id}`}
          className="font-bold text-ink hover:text-accent"
        >
          {itemTitle(item.title, item.id)}
        </Link>
        {followUp && (
          <div className="text-label text-accent">
            Seit {followUp.stage} Tagen online
          </div>
        )}
      </td>
      <td className="py-2 pr-3">
        <PhaseBadge status={item.status} />
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-ink">
        {formatEur(item.purchasePriceEur)}
      </td>
      <td className="py-2 text-right tabular-nums text-ink">
        {formatEur(item.askingPriceEur)}
      </td>
    </tr>
  );
}

function SoldRow({ item }: { item: SoldSaleItem }) {
  return (
    <tr className="border-t border-line">
      <td className="py-2 pr-3">
        <Link
          to={`/items/${item.id}`}
          className="font-bold text-ink hover:text-accent"
        >
          {itemTitle(item.title, item.id)}
        </Link>
      </td>
      <td className="py-2 pr-3 text-ink whitespace-nowrap">
        {soldDate(item.soldAt)}
      </td>
      <td className="py-2 pr-3 text-ink">{item.portal ?? "—"}</td>
      <td className="py-2 pr-3 text-right tabular-nums text-ink">
        {formatEur(item.proceedsEur)}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-ink">
        {formatEur(item.feeEur)}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-ink">
        {formatEur(item.shippingEur)}
      </td>
      <td
        className={`py-2 text-right tabular-nums font-bold ${
          item.netProfitEur != null && item.netProfitEur < 0
            ? "text-danger"
            : "text-ink"
        }`}
      >
        {formatEur(item.netProfitEur)}
      </td>
    </tr>
  );
}
