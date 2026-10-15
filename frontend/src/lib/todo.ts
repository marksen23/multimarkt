import type { ItemListEntry } from '../api/types';
import { daysSince } from './format';

export const STALE_DAYS = 14;

export interface TodoGroup {
  key: string;
  title: string;
  /** Leer = informativ, keine Handlung des Nutzers nötig. */
  action: string;
  match: (e: ItemListEntry) => boolean;
}

/** Reihenfolge = Dringlichkeit. Einzige Quelle für „Heute“ und die Badge-Zahl. */
export const TODO_GROUPS: TodoGroup[] = [
  { key: 'conflict', title: 'Konflikt lösen', action: 'Lösen', match: (e) => e.item.status === 'SALE_CONFLICT' },
  { key: 'review', title: 'Angaben prüfen', action: 'Prüfen', match: (e) => e.item.status === 'REVIEW_REQUIRED' },
  { key: 'ready', title: 'Bereit zum Inserieren', action: 'Inserieren', match: (e) => e.item.status === 'READY' },
  { key: 'photos', title: 'Fotos fehlen', action: 'Fotos', match: (e) => e.item.status === 'NEW' },
  { key: 'analyzing', title: 'KI analysiert gerade', action: '', match: (e) => e.item.status === 'ANALYZING' },
  {
    key: 'stale',
    title: `Seit über ${STALE_DAYS} Tagen online`,
    action: 'Verkauft?',
    match: (e) => e.item.status === 'LISTED' && daysSince(e.item.updatedAt) > STALE_DAYS,
  },
];

export function isTodo(e: ItemListEntry): boolean {
  return TODO_GROUPS.some((g) => g.action !== '' && g.match(e));
}
