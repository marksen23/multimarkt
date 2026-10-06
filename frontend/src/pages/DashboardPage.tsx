import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { worklistApi } from '../api/worklist';
import { ApiRequestError } from '../api/client';
import type {
  ItemLifecycleState,
  ItemListEntry,
  Worklist,
  WorklistBundleEntry,
  WorklistEntry,
  WorklistGroup,
  WorklistGroupId,
  WorklistReason,
} from '../api/types';
import { ListSkeleton } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';
import { STATUS_LABELS } from '../components/status-labels';

const ITEM_STATUSES: ItemLifecycleState[] = [
  'NEW',
  'ANALYZING',
  'REVIEW_REQUIRED',
  'READY',
  'BUNDLED',
  'LISTED',
  'SALE_CONFLICT',
  'SOLD',
  'ARCHIVED',
  'CANCELLED',
];

type StatusFilter = 'ALL' | ItemLifecycleState;

const GROUP_COPY: Record<
  WorklistGroupId,
  { title: string; hint: (staleOnlineDays: number) => string; emptyNextStep: (staleOnlineDays: number) => string }
> = {
  AWAITING_CONFIRMATION: {
    title: 'Wartet auf Bestätigung',
    hint: () => 'Zustand oder Online-Stellung',
    emptyNextStep: () => 'Nächster Schritt: Fotos hochladen und den Zustand bestätigen.',
  },
  PRICE_MISSING: {
    title: 'Preis fehlt',
    hint: () => 'Bereit, noch kein Verkaufspreis',
    emptyNextStep: () => 'Nächster Schritt: den Zustand bestätigen und danach den Verkaufspreis setzen.',
  },
  STALE_ONLINE: {
    title: 'Online ohne Verkauf',
    hint: (days) => `Seit ${days} Tagen`,
    emptyNextStep: (days) =>
      `Nächster Schritt: eine Anzeige als online bestätigen. Nach ${days} Tagen ohne Verkauf liegt sie hier.`,
  },
  SALE_CONFLICT: {
    title: 'Konflikt offen',
    hint: () => 'Nur du löst das auf',
    emptyNextStep: () => 'Nächster Schritt: bei einem Doppelverkauf den gültigen Verkauf auswählen.',
  },
  INCOMPLETE_BUNDLE: {
    title: 'Bundle unvollständig',
    hint: () => 'Weniger als zwei Artikel',
    emptyNextStep: () => 'Nächster Schritt: ein Bundle anlegen und mindestens zwei Artikel hinzufügen.',
  },
};

const STATUS_NEXT_STEP: Record<ItemLifecycleState, string> = {
  NEW: 'Nächster Schritt: Fotos hochladen, damit die Analyse starten kann.',
  ANALYZING: 'Nächster Schritt: die Bildanalyse abwarten oder die Fotos erneut hochladen.',
  REVIEW_REQUIRED: 'Nächster Schritt: den Zustand im Artikel bestätigen.',
  READY: 'Nächster Schritt: den Verkaufspreis setzen.',
  BUNDLED: 'Nächster Schritt: das Bundle öffnen und prüfen, ob alle Artikel drin sind.',
  LISTED: 'Nächster Schritt: die Anzeige veröffentlichen und als online bestätigen.',
  SALE_CONFLICT: 'Nächster Schritt: den gültigen Verkauf auswählen.',
  SOLD: 'Nächster Schritt: einen neuen Artikel anlegen, wenn du weiterverkaufen willst.',
  ARCHIVED: 'Nächster Schritt: einen verkauften Artikel archivieren, wenn du ihn aus dem Alltag nehmen willst.',
  CANCELLED: 'Nächster Schritt: einen neuen Artikel anlegen, wenn du weitermachen willst.',
};

const REASON_NEXT_STEP: Record<WorklistReason, string> = {
  CONFIRM_CONDITION: 'Nächster Schritt: Zustand bestätigen.',
  CONFIRM_ONLINE: 'Nächster Schritt: bestätigen, dass die Anzeige online ist.',
  PUBLISH_LISTING: 'Nächster Schritt: Anzeige veröffentlichen und als online bestätigen.',
  SET_PRICE: 'Nächster Schritt: Verkaufspreis setzen.',
  STALE_ONLINE: 'Nächster Schritt: Artikel öffnen und Preis oder Verkauf prüfen.',
  RESOLVE_CONFLICT: 'Nächster Schritt: den gültigen Verkauf auswählen.',
  ADD_BUNDLE_ITEMS: 'Nächster Schritt: mindestens zwei Artikel ins Bundle legen.',
};

/**
 * Gruppierte Startseite (Feature-Plan §2.5 / §3.1). `GET /worklist` leitet
 * die Gruppen aus vorhandenen Zuständen ab; der Statusfilter schneidet
 * dieselbe Antwort zu, ohne eine zweite Abfrage.
 */
export function DashboardPage() {
  const [worklist, setWorklist] = useState<Worklist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('ALL');

  useEffect(() => {
    worklistApi
      .get()
      .then(setWorklist)
      .catch((e) => setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler'));
  }, []);

  const hasInventory =
    !!worklist &&
    (worklist.otherItems.length > 0 || worklist.groups.some((group) => group.entries.length > 0));

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-ink tracking-tight">Arbeitsliste</h1>
          {worklist && hasInventory && (
            <p className="text-xs text-ink-muted mt-0.5">{summaryLine(worklist, filter)}</p>
          )}
        </div>
        <Link
          to="/new"
          className="px-4 py-2 rounded-full bg-accent text-accent-ink text-sm font-bold hover:bg-accent-hover transition-colors shadow-sm shrink-0"
        >
          + Neuer Artikel
        </Link>
      </div>

      {error && (
        <div className="bg-danger-soft border border-danger/20 rounded-xl p-4 text-sm text-danger">{error}</div>
      )}

      {!worklist && !error && <ListSkeleton />}

      {worklist && hasInventory && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="toolbar" aria-label="Nach Status filtern">
          <FilterChip label="Alle" pressed={filter === 'ALL'} onClick={() => setFilter('ALL')} />
          {ITEM_STATUSES.map((status) => (
            <FilterChip
              key={status}
              label={STATUS_LABELS[status] ?? status}
              pressed={filter === status}
              onClick={() => setFilter(status)}
            />
          ))}
        </div>
      )}

      {worklist && !hasInventory && <EmptyInventory />}

      {worklist && hasInventory && filter === 'ALL' && (
        <GroupedList worklist={worklist} filter="ALL" showEmptyGroups />
      )}

      {worklist && hasInventory && filter !== 'ALL' && (
        <FilteredList worklist={worklist} filter={filter} />
      )}
    </div>
  );
}

function summaryLine(worklist: Worklist, filter: StatusFilter): string {
  if (filter === 'ALL') {
    const count = worklist.groups.reduce((sum, group) => sum + group.entries.length, 0);
    if (count === 0) return 'Heute liegt kein Handgriff an.';
    if (count === 1) return 'Heute 1 Handgriff.';
    return `Heute ${count} Handgriffe.`;
  }
  const count = countForStatus(worklist, filter);
  const label = STATUS_LABELS[filter] ?? filter;
  if (count === 1) return `1 Artikel: ${label}.`;
  return `${count} Artikel: ${label}.`;
}

function countForStatus(worklist: Worklist, status: ItemLifecycleState): number {
  const inGroups = worklist.groups.reduce(
    (sum, group) =>
      sum + group.entries.filter((entry) => entry.kind === 'item' && entry.item.status === status).length,
    0,
  );
  const rest = worklist.otherItems.filter((entry) => entry.item.status === status).length;
  return inGroups + rest;
}

function GroupedList({
  worklist,
  filter,
  showEmptyGroups,
}: {
  worklist: Worklist;
  filter: StatusFilter;
  showEmptyGroups: boolean;
}) {
  const rest = worklist.otherItems.filter(
    (entry) => filter === 'ALL' || entry.item.status === filter,
  );

  return (
    <div className="space-y-6">
      {worklist.groups.map((group) => {
        const entries = entriesFor(group, filter);
        if (entries.length === 0 && !showEmptyGroups) return null;
        const copy = GROUP_COPY[group.id];
        return (
          <section key={group.id} className="space-y-2" aria-label={copy.title}>
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                {copy.title}
                <span className="ml-2 text-ink-faint">{entries.length}</span>
              </h2>
              <p className="text-[11px] text-ink-faint">{copy.hint(worklist.staleOnlineDays)}</p>
            </div>
            {entries.length === 0 ? (
              <p className="bg-surface border border-dashed border-line rounded-2xl px-4 py-3 text-sm text-ink-muted">
                {copy.emptyNextStep(worklist.staleOnlineDays)}
              </p>
            ) : (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <WorklistCard key={cardKey(entry)} entry={entry} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {rest.length > 0 && (
        <section className="space-y-2" aria-label="Weitere Artikel">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted px-1">
            Weitere Artikel
            <span className="ml-2 text-ink-faint">{rest.length}</span>
          </h2>
          <div className="space-y-2">
            {rest.map((entry) => (
              <ItemCard key={entry.item.id} entry={entry} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FilteredList({ worklist, filter }: { worklist: Worklist; filter: ItemLifecycleState }) {
  const grouped = worklist.groups
    .map((group) => ({ group, entries: entriesFor(group, filter) }))
    .filter(({ entries }) => entries.length > 0);
  const rest = worklist.otherItems.filter((entry) => entry.item.status === filter);

  if (grouped.length === 0 && rest.length === 0) {
    return (
      <div className="bg-surface border border-dashed border-line rounded-2xl p-8 text-center">
        <p className="text-sm text-ink-muted">{STATUS_NEXT_STEP[filter]}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ group, entries }) => (
        <section key={group.id} className="space-y-2" aria-label={GROUP_COPY[group.id].title}>
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted px-1">
            {GROUP_COPY[group.id].title}
            <span className="ml-2 text-ink-faint">{entries.length}</span>
          </h2>
          <div className="space-y-2">
            {entries.map((entry) => (
              <WorklistCard key={cardKey(entry)} entry={entry} />
            ))}
          </div>
        </section>
      ))}
      {rest.length > 0 && (
        <div className="space-y-2">
          {grouped.length > 0 && (
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted px-1">Weitere Artikel</h2>
          )}
          {rest.map((entry) => (
            <ItemCard key={entry.item.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function entriesFor(group: WorklistGroup, filter: StatusFilter): WorklistEntry[] {
  if (group.id === 'INCOMPLETE_BUNDLE') return filter === 'ALL' ? group.entries : [];
  return group.entries.filter(
    (entry) => entry.kind === 'item' && (filter === 'ALL' || entry.item.status === filter),
  );
}

function cardKey(entry: WorklistEntry): string {
  return entry.kind === 'item' ? entry.item.id : entry.bundle.id;
}

function WorklistCard({ entry }: { entry: WorklistEntry }) {
  if (entry.kind === 'bundle') return <BundleCard entry={entry} />;
  return <ItemCard entry={entry} nextStep={nextStepFor(entry)} onlineSince={entry.onlineSince} staleDays={entry.staleDays} />;
}

function nextStepFor(entry: WorklistEntry): string {
  if (entry.kind === 'bundle') return bundleNextStep(entry.itemCount);
  if (entry.reason === 'STALE_ONLINE' && entry.staleDays != null) {
    const since = entry.staleDays === 1 ? '1 Tag' : `${entry.staleDays} Tagen`;
    return `Online seit ${since}. ${REASON_NEXT_STEP.STALE_ONLINE}`;
  }
  return REASON_NEXT_STEP[entry.reason];
}

function bundleNextStep(itemCount: number): string {
  if (itemCount <= 0) return 'Nächster Schritt: mindestens zwei fertige Artikel hinzufügen.';
  if (itemCount === 1) return 'Nächster Schritt: noch mindestens einen Artikel hinzufügen.';
  return 'Nächster Schritt: die Artikelzuordnung im Bundle abschließen.';
}

function ItemCard({
  entry,
  nextStep,
  onlineSince,
  staleDays,
}: {
  entry: ItemListEntry | Extract<WorklistEntry, { kind: 'item' }>;
  nextStep?: string;
  onlineSince?: string | null;
  staleDays?: number | null;
}) {
  const { item, listings, thumbnailUrl } = entry;
  return (
    <Link
      to={`/items/${item.id}`}
      className="block bg-surface border border-line rounded-2xl p-4 hover:border-accent/40 hover:shadow-md transition"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {thumbnailUrl && (
            <img
              src={thumbnailUrl}
              alt=""
              className="w-12 h-12 rounded-xl object-cover border border-line shrink-0"
            />
          )}
          <div className="min-w-0">
            <p className="font-bold text-ink text-sm truncate">{item.title ?? `Artikel ${item.id.slice(0, 8)}`}</p>
            <p className="text-xs text-ink-faint">{item.condition ?? 'Zustand noch nicht bestätigt'}</p>
          </div>
        </div>
        <StatusBadge status={item.status} />
      </div>
      {onlineSince && staleDays != null && (
        <p className="mt-2 text-xs text-ink-faint">
          Online seit {formatDay(onlineSince)}
        </p>
      )}
      {nextStep && <p className="mt-2 text-xs font-semibold text-accent">{nextStep}</p>}
      {listings.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {listings.flatMap((listing) =>
            listing.projections.map((projection) => (
              <span
                key={projection.id}
                className="text-[11px] px-2 py-1 rounded-lg bg-surface-hover border border-line text-ink-muted flex items-center gap-1"
              >
                {projection.marketplaceId}
                <StatusBadge status={projection.status} />
              </span>
            )),
          )}
        </div>
      )}
    </Link>
  );
}

function BundleCard({ entry }: { entry: WorklistBundleEntry }) {
  const countLabel = entry.itemCount === 1 ? '1 Artikel' : `${entry.itemCount} Artikel`;
  return (
    <Link
      to={`/bundles/${entry.bundle.id}`}
      className="block bg-surface border border-line rounded-2xl p-4 hover:border-accent/40 hover:shadow-md transition"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-ink text-sm truncate">{entry.bundle.title}</p>
          <p className="text-xs text-ink-faint">{countLabel}</p>
        </div>
        <StatusBadge status={entry.bundle.status} />
      </div>
      <p className="mt-2 text-xs font-semibold text-accent">{bundleNextStep(entry.itemCount)}</p>
    </Link>
  );
}

function FilterChip({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
        pressed ? 'bg-accent text-accent-ink' : 'bg-surface border border-line text-ink-muted hover:bg-surface-hover'
      }`}
    >
      {label}
    </button>
  );
}

function EmptyInventory() {
  return (
    <div className="bg-surface border border-line rounded-2xl p-8 text-center space-y-2">
      <p className="text-sm text-ink-muted">Noch keine Artikel erfasst.</p>
      <Link to="/new" className="text-sm font-bold text-accent hover:text-accent-hover">
        Nächster Schritt: ersten Artikel anlegen
      </Link>
    </div>
  );
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
}
