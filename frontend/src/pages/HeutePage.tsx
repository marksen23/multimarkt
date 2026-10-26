import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { ItemListEntry, Worklist, WorklistBundleEntry } from '../api/types';
import { ItemRow } from '../components/ItemRow';
import { ListSkeleton } from '../components/Skeleton';
import { useItems } from '../contexts/ItemsContext';
import { ButtonLink, Card, EmptyState, Icon, Notice, PageHeader, SectionLabel, type IconName } from '../ui';
import { formatEuro, realizedPrice } from '../lib/format';
import { localSlotEntries, reasonMeta, REASON_ACTION, slotTitle, TODO_ORDER, type TodoSlot } from '../lib/todo';

export function HeutePage() {
  const { entries, worklist, error, refresh, pendingCount: todo } = useItems();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sections = entries && worklist ? buildSections(worklist, entries) : [];

  const listed = entries?.filter((e) => e.item.status === 'LISTED') ?? [];
  const pipeline = listed.reduce((s, e) => s + (e.listings[0]?.sellingPrice ?? 0), 0);
  const sold = entries?.filter((e) => e.item.status === 'SOLD') ?? [];
  const revenue = sold.reduce((s, e) => s + realizedPrice(e), 0);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-6">
      <PageHeader
        title="Heute"
        subtitle={
          entries === null
            ? 'Lädt…'
            : (() => {
                const analyzing = entries.filter((e) => e.item.status === 'ANALYZING').length;
                if (todo === 0 && analyzing === 0) return 'Nichts zu tun.';
                const parts: string[] = [];
                if (todo > 0) parts.push(`${todo} ${todo === 1 ? 'Artikel wartet' : 'Artikel warten'}`);
                if (analyzing > 0) parts.push(`${analyzing} wird analysiert`);
                return parts.join(' · ');
              })()
        }
      />

      {error && <Notice tone="danger">{error}</Notice>}

      {entries === null && !error && <ListSkeleton />}

      {entries && entries.length === 0 && <Onboarding />}

      {entries && entries.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <Stat icon="tag" label="Online" value={String(listed.length)} sub={pipeline > 0 ? formatEuro(pipeline, 0) : undefined} />
          <Stat icon="euro" label="Verkauft" value={String(sold.length)} sub={revenue > 0 ? formatEuro(revenue, 0) : undefined} />
        </div>
      )}

      {sections.map((sec) => (
        <section key={sec.slot} aria-label={sec.title}>
          <SectionLabel>
            {sec.title} · {sec.rows.length}
          </SectionLabel>
          <div className="space-y-2">{sec.rows}</div>
        </section>
      ))}

      {entries && entries.length > 0 && todo === 0 && (
        <EmptyState
          icon="check"
          title="Alles erledigt"
          text="Kein Artikel braucht gerade deine Aufmerksamkeit."
          action={<ButtonLink to="/new" icon="camera">Nächsten Artikel erfassen</ButtonLink>}
        />
      )}
    </div>
  );
}

function buildSections(worklist: Worklist, entries: ItemListEntry[]) {
  const groups = new Map(worklist.groups.map((g) => [g.id as TodoSlot, g.entries]));
  return TODO_ORDER.map((slot) => {
    const title = slotTitle(slot, worklist.staleOnlineDays);
    if (slot === 'PHOTOS' || slot === 'ANALYZING') {
      const action = slot === 'PHOTOS' ? 'Fotos' : undefined;
      const rows = localSlotEntries(slot, entries).map((e) => <ItemRow key={e.item.id} entry={e} action={action} />);
      return { slot, title, rows };
    }
    const rows = (groups.get(slot) ?? []).map((e) =>
      e.kind === 'bundle' ? (
        <BundleRow key={e.bundle.id} entry={e} />
      ) : (
        <ItemRow
          key={e.item.id}
          entry={{ ...e, soldPrice: null }}
          action={REASON_ACTION[e.reason]}
          meta={reasonMeta(e)}
        />
      ),
    );
    return { slot, title, rows };
  }).filter((sec) => sec.rows.length > 0);
}

function BundleRow({ entry: { bundle, itemCount, reason } }: { entry: WorklistBundleEntry }) {
  return (
    <Link
      to={`/bundles/${bundle.id}`}
      className="group flex items-center gap-3 bg-surface border border-line rounded-card shadow-card p-3 transition-colors hover:border-accent/40 outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="w-14 h-14 rounded-control bg-surface-hover border border-line shrink-0 flex items-center justify-center text-ink-faint">
        <Icon name="layers" size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-ink truncate">{bundle.title}</p>
        <p className="text-label font-normal text-ink-faint truncate">
          {itemCount === 1 ? '1 Artikel' : `${itemCount} Artikel`} · mindestens 2 nötig
        </p>
      </div>
      <span className="shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-full bg-accent text-accent-ink text-label">
        {REASON_ACTION[reason]}
        <Icon name="chevronRight" size={14} strokeWidth={2.4} />
      </span>
    </Link>
  );
}

function Stat({ icon, label, value, sub }: { icon: IconName; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-3 flex items-center gap-3">
      <span className="w-9 h-9 rounded-control bg-accent-soft text-accent flex items-center justify-center">
        <Icon name={icon} size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-title text-ink tabular-nums">
          {value}
          {sub && <span className="ml-1.5 text-label text-accent">{sub}</span>}
        </p>
        <p className="text-label font-normal text-ink-faint">{label}</p>
      </div>
    </Card>
  );
}

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'camera', title: 'Fotografieren', text: 'Artikel, Etikett oder Typenschild.' },
  { icon: 'sparkle', title: 'KI prüft', text: 'Titel, Zustand und Preis werden vorgeschlagen.' },
  { icon: 'copy', title: 'Inserieren', text: 'Fertige Texte je Portal kopieren.' },
];

function Onboarding() {
  return (
    <Card className="p-6 space-y-5">
      <div>
        <p className="text-title text-ink">Dein erster Artikel</p>
        <p className="text-body text-ink-muted">Foto machen, der Rest geht fast von selbst.</p>
      </div>
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-accent-soft text-accent flex items-center justify-center">
              <Icon name={s.icon} size={17} />
            </span>
            <div>
              <p className="text-body font-semibold text-ink">
                {i + 1}. {s.title}
              </p>
              <p className="text-label font-normal text-ink-faint">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <ButtonLink to="/new" block size="lg" icon="camera">
        Ersten Artikel erfassen
      </ButtonLink>
    </Card>
  );
}
