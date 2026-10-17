import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApiRequestError } from "../api/client";
import { followUpsApi, type FollowUpCard } from "../api/follow-ups";
import {
  salesApi,
  type OpenSaleItem,
  type SalesWeek,
  type SoldSaleItem,
} from "../api/sales";
import { ListSkeleton } from "../components/Skeleton";
import { StatusBadge } from "../components/StatusBadge";
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
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-ink tracking-tight">
          Verkäufe
        </h1>
        <p className="text-xs text-ink-muted mt-1">
          Offene Artikel, abgeschlossene Verkäufe und die Marge der letzten
          Wochen.
        </p>
      </div>

      {error && (
        <div className="bg-danger-soft border border-danger/20 rounded-xl p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {!overview && !error && <ListSkeleton />}

      {overview && (
        <>
          <FollowUpSection followUps={followUps} />

          <section className="bg-surface border border-line rounded-2xl p-4">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide mb-2">
              Marge der letzten Wochen
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-ink-faint">
                    <th className="font-bold py-2 pr-3">Woche</th>
                    <th className="font-bold py-2 pr-3 text-right">Verkäufe</th>
                    <th className="font-bold py-2 text-right">Marge</th>
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
            </div>
          </section>

          <ItemTable
            title={`Offen (${overview.openItems.length})`}
            empty="Keine offenen Artikel."
            isEmpty={overview.openItems.length === 0}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase text-ink-faint">
                  <th className="font-bold py-2 pr-3">Artikel</th>
                  <th className="font-bold py-2 pr-3">Status</th>
                  <th className="font-bold py-2 pr-3 text-right">Einstand</th>
                  <th className="font-bold py-2 text-right">Preis</th>
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
            isEmpty={overview.soldItems.length === 0}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase text-ink-faint">
                  <th className="font-bold py-2 pr-3">Artikel</th>
                  <th className="font-bold py-2 pr-3">Datum</th>
                  <th className="font-bold py-2 pr-3">Portal</th>
                  <th className="font-bold py-2 pr-3 text-right">Erlös</th>
                  <th className="font-bold py-2 pr-3 text-right">Gebühr</th>
                  <th className="font-bold py-2 pr-3 text-right">Versand</th>
                  <th className="font-bold py-2 text-right">Nettogewinn</th>
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
  isEmpty,
  children,
}: {
  title: string;
  empty: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <section className="bg-surface border border-line rounded-2xl p-4">
      <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide mb-2">
        {title}
      </h2>
      {isEmpty ? (
        <p className="text-sm text-ink-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
    </section>
  );
}

function FollowUpSection({ followUps }: { followUps: FollowUpCard[] }) {
  return (
    <section className="bg-surface border border-line rounded-2xl p-4">
      <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide mb-2">
        Nachfassen ({followUps.length})
      </h2>
      {followUps.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Keine Anzeige, die seit 7 oder 14 Tagen online ist.
        </p>
      ) : (
        <ul className="space-y-3">
          {followUps.map((card) => (
            <li
              key={card.listingId}
              className="border-t border-line pt-3 first:border-t-0 first:pt-0"
            >
              <Link
                to={`/items/${card.itemId}`}
                className="font-bold text-ink hover:text-accent text-sm"
              >
                {itemTitle(card.title, card.itemId)}
              </Link>
              <p className="text-xs text-ink-muted mt-1">{card.headline}</p>
              <p className="text-xs text-ink mt-1">
                {formatEur(card.currentPrice)} →{" "}
                {formatEur(card.suggestedPrice)}
              </p>
            </li>
          ))}
        </ul>
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
          <div className="text-[11px] font-semibold text-accent">
            Nachfassen · {followUp.stage} Tage
          </div>
        )}
      </td>
      <td className="py-2 pr-3">
        <StatusBadge status={item.status} />
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
