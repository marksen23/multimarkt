import { useEffect, useState } from 'react';
import { ItemRow } from '../components/ItemRow';
import { ListSkeleton } from '../components/Skeleton';
import { useItems } from '../contexts/ItemsContext';
import type { ItemListEntry } from '../api/types';
import { CHANNEL_FILTERS, channelSearchText, matchesChannelFilter, type ChannelFilter } from '../lib/channel-status';
import { Button, ButtonLink, EmptyState, Icon, Notice, PageHeader, inputClass, statusInfo, type Phase } from '../ui';

type FilterKey = 'active' | Exclude<Phase, 'conflict'>;
type SortKey = 'newest' | 'oldest' | 'price-desc' | 'price-asc';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'active', label: 'Aktiv' },
  { key: 'capture', label: 'Erfassen' },
  { key: 'review', label: 'Prüfen' },
  { key: 'ready', label: 'Inserieren' },
  { key: 'live', label: 'Online' },
  { key: 'done', label: 'Verkauft' },
  { key: 'archive', label: 'Archiv' },
];

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Neueste zuerst',
  oldest: 'Älteste zuerst',
  'price-desc': 'Preis absteigend',
  'price-asc': 'Preis aufsteigend',
};

function phaseOf(e: ItemListEntry): Phase {
  const p = statusInfo(e.item.status).phase;
  return p === 'conflict' ? 'live' : p;
}

function matches(e: ItemListEntry, f: FilterKey) {
  const p = phaseOf(e);
  return f === 'active' ? p !== 'done' && p !== 'archive' : p === f;
}

function price(e: ItemListEntry) {
  return e.listings[0]?.sellingPrice ?? 0;
}

function sortEntries(list: ItemListEntry[], sort: SortKey) {
  return [...list].sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return new Date(a.item.createdAt).getTime() - new Date(b.item.createdAt).getTime();
      case 'price-desc':
        return price(b) - price(a);
      case 'price-asc':
        return price(a) - price(b);
      default:
        return new Date(b.item.createdAt).getTime() - new Date(a.item.createdAt).getTime();
    }
  });
}

function readSort(): SortKey {
  try {
    const v = localStorage.getItem('dashboard_sort');
    return v && v in SORT_LABELS ? (v as SortKey) : 'newest';
  } catch {
    return 'newest';
  }
}

export function BestandPage() {
  const { entries, error, refresh } = useItems();
  const [filter, setFilter] = useState<FilterKey>('active');
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [sort, setSort] = useState<SortKey>(readSort);
  const [search, setSearch] = useState('');

  useEffect(() => {
    refresh();
  }, [refresh]);

  const q = search.trim().toLowerCase();
  const searched =
    entries?.filter((e) => {
      if (!q) return true;
      const haystack = `${e.item.title ?? ''} ${e.item.condition ?? ''} ${channelSearchText(e.listings)}`.toLowerCase();
      return haystack.includes(q);
    }) ?? [];
  const inChannel = searched.filter((e) => matchesChannelFilter(e.listings, channel));
  const visible = sortEntries(
    inChannel.filter((e) => matches(e, filter)),
    sort,
  );
  const soldCount = entries?.filter((e) => e.item.status === 'SOLD').length ?? 0;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-4">
      <PageHeader
        title="Bestand"
        subtitle={
          entries
            ? q || filter !== 'active' || channel !== 'all'
              ? `${visible.length} angezeigt · ${entries.length} gesamt`
              : `${entries.length} Artikel insgesamt`
            : undefined
        }
        action={
          soldCount > 0 && entries ? (
            <Button variant="ghost" size="sm" icon="download" onClick={() => exportSoldCsv(entries)} aria-label="Verkaufte Artikel als CSV herunterladen">
              Verkaufsliste
            </Button>
          ) : undefined
        }
      />

      {error && <Notice tone="danger">{error}</Notice>}

      {entries && entries.length > 0 && (
        <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-bg/95 backdrop-blur-sm space-y-2">
          <div role="search" className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
              <input
                type="search"
                placeholder="Artikel suchen"
                enterKeyHint="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${inputClass} pl-9`}
                aria-label="Artikel suchen"
              />
            </div>
            <label className="relative shrink-0 w-11 h-11 rounded-control border border-line bg-surface text-ink-muted flex items-center justify-center hover:text-ink focus-within:border-accent">
              <Icon name="sort" />
              <select
                value={sort}
                onChange={(e) => {
                  const key = e.target.value as SortKey;
                  setSort(key);
                  try {
                    localStorage.setItem('dashboard_sort', key);
                  } catch {
                    /* Sortierung bleibt dann nur für diese Sitzung */
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label={`Sortierung: ${SORT_LABELS[sort]}`}
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="-mx-4 px-4 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]" role="tablist" aria-label="Kanal filtern">
            {CHANNEL_FILTERS.map(({ key, label }) => {
              const active = channel === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setChannel(key)}
                  className={`shrink-0 h-8 px-3 rounded-full text-label border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    active
                      ? 'bg-accent text-accent-ink border-accent'
                      : 'bg-surface text-ink-muted border-line hover:text-ink hover:border-ink-faint'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="-mx-4 px-4 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]" role="tablist" aria-label="Artikel filtern">
              {FILTERS.map(({ key, label }) => {
                const count = inChannel.filter((e) => matches(e, key)).length;
                const active = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(key)}
                    className={`shrink-0 h-8 px-3 rounded-full text-label border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      active
                        ? 'bg-ink text-bg border-ink'
                        : 'bg-surface text-ink-muted border-line hover:text-ink hover:border-ink-faint'
                    }`}
                  >
                    {label}
                    {count > 0 && <span className="ml-1 tabular-nums opacity-70">{count}</span>}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {entries === null && !error && <ListSkeleton />}

      {entries && entries.length === 0 && (
        <EmptyState
          icon="layers"
          title="Noch kein Bestand"
          text="Erfasse deinen ersten Artikel mit einem Foto."
          action={<ButtonLink to="/new" icon="camera">Artikel erfassen</ButtonLink>}
        />
      )}

      {entries && entries.length > 0 && visible.length === 0 && (
        <EmptyState
          icon="search"
          title={
            q
              ? `Keine Treffer für „${search.trim()}“`
              : channel !== 'all'
                ? 'Keine Artikel für diesen Kanal'
                : 'Keine Artikel in dieser Phase'
          }
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFilter('active');
                setChannel('all');
                setSearch('');
              }}
            >
              Filter zurücksetzen
            </Button>
          }
        />
      )}

      <div aria-live="polite" className="space-y-2">
        {visible.map((e) => (
          <ItemRow key={e.item.id} entry={e} />
        ))}
      </div>
    </div>
  );
}

function exportSoldCsv(entries: ItemListEntry[]) {
  const sold = entries.filter((e) => e.item.status === 'SOLD');
  if (sold.length === 0) return;
  const rows: string[][] = [['Titel', 'Zustand', 'Listingpreis (€)', 'Verkaufspreis (€)', 'Erstellt', 'Aktualisiert']];
  for (const { item, listings, soldPrice } of sold) {
    rows.push([
      item.title ?? item.id,
      item.condition ?? '',
      listings[0]?.sellingPrice?.toFixed(2) ?? '',
      soldPrice?.toFixed(2) ?? '',
      new Date(item.createdAt).toLocaleDateString('de-DE'),
      new Date(item.updatedAt).toLocaleDateString('de-DE'),
    ]);
  }
  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `verkaufshistorie-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
