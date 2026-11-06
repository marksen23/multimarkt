import type { ItemListEntry, Worklist, WorklistGroupId, WorklistItemEntry, WorklistReason } from '../api/types';

/**
 * „Heute“ = Server-Arbeitsliste (`GET /worklist`) plus die zwei Schritte,
 * die sie bewusst nicht kennt: Fotos fehlen (NEW) und Analyse läuft.
 * Reihenfolge = Dringlichkeit. Einzige Quelle für „Heute“ und die Badge-Zahl.
 */
export type TodoSlot = WorklistGroupId | 'PHOTOS' | 'ANALYZING';

export const TODO_ORDER: TodoSlot[] = [
  'SALE_CONFLICT',
  'AWAITING_CONFIRMATION',
  'PRICE_MISSING',
  'PHOTOS',
  'ANALYZING',
  'STALE_ONLINE',
  'INCOMPLETE_BUNDLE',
];

export function slotTitle(slot: TodoSlot, staleOnlineDays: number): string {
  switch (slot) {
    case 'SALE_CONFLICT':
      return 'Konflikt lösen';
    case 'AWAITING_CONFIRMATION':
      return 'Wartet auf Bestätigung';
    case 'PRICE_MISSING':
      return 'Bereit zum Inserieren';
    case 'PHOTOS':
      return 'Fotos fehlen';
    case 'ANALYZING':
      return 'KI analysiert gerade';
    case 'STALE_ONLINE':
      return `Seit ${staleOnlineDays}+ Tagen online`;
    case 'INCOMPLETE_BUNDLE':
      return 'Bundle unvollständig';
  }
}

export const REASON_ACTION: Record<WorklistReason, string> = {
  RESOLVE_CONFLICT: 'Lösen',
  CONFIRM_CONDITION: 'Prüfen',
  CONFIRM_ONLINE: 'Online?',
  PUBLISH_LISTING: 'Inserieren',
  SET_PRICE: 'Inserieren',
  STALE_ONLINE: 'Verkauft?',
  ADD_BUNDLE_ITEMS: 'Ergänzen',
};

/** Zusatzzeile in der Zeile, wo der Grund mehr sagt als der Status. */
export function reasonMeta(entry: WorklistItemEntry): string | undefined {
  if (entry.reason === 'CONFIRM_ONLINE') return 'Anzeige online? Bitte bestätigen';
  if (entry.reason === 'PUBLISH_LISTING') return 'Anzeige noch nicht veröffentlicht';
  if (entry.reason === 'STALE_ONLINE' && entry.staleDays != null) return `Seit ${entry.staleDays} Tagen online`;
  return undefined;
}

export function localSlotEntries(slot: 'PHOTOS' | 'ANALYZING', entries: ItemListEntry[]): ItemListEntry[] {
  const status = slot === 'PHOTOS' ? 'NEW' : 'ANALYZING';
  return entries.filter((e) => e.item.status === status);
}

/** Handgriffe, die der Nutzer selbst erledigen muss (Analyse läuft zählt nicht). */
export function countTodo(worklist: Worklist | null, entries: ItemListEntry[] | null): number {
  const server = worklist?.groups.reduce((sum, g) => sum + g.entries.length, 0) ?? 0;
  return server + (entries ? localSlotEntries('PHOTOS', entries).length : 0);
}
