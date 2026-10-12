import { useEffect } from 'react';
import { ItemRow } from '../components/ItemRow';
import { ListSkeleton } from '../components/Skeleton';
import { useItems } from '../contexts/ItemsContext';
import { ButtonLink, Card, EmptyState, Icon, Notice, PageHeader, SectionLabel, type IconName } from '../ui';
import { formatEuro, realizedPrice } from '../lib/format';
import { TODO_GROUPS } from '../lib/todo';

export function HeutePage() {
  const { entries, error, refresh, pendingCount: todo } = useItems();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const groups = TODO_GROUPS.map((g) => ({ ...g, items: entries?.filter(g.match) ?? [] })).filter(
    (g) => g.items.length > 0,
  );

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
            : todo === 0
              ? 'Nichts zu tun.'
              : `${todo} ${todo === 1 ? 'Artikel wartet' : 'Artikel warten'} auf dich.`
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

      {groups.map((g) => (
        <section key={g.key}>
          <SectionLabel>
            {g.title} · {g.items.length}
          </SectionLabel>
          <div className="space-y-2">
            {g.items.map((e) => (
              <ItemRow key={e.item.id} entry={e} action={g.action || undefined} />
            ))}
          </div>
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
