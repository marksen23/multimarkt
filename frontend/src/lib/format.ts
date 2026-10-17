import type { ItemListEntry } from '../api/types';

/** Erlös eines Artikels: echter Verkaufspreis, sonst Listingpreis. */
export function realizedPrice(e: ItemListEntry): number {
  return e.soldPrice ?? e.listings[0]?.sellingPrice ?? 0;
}

export function formatEuro(value: number, decimals: 0 | 2 = 2): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} €`;
}

export function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 2) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  if (hours < 24) return `vor ${hours} Std.`;
  if (days === 1) return 'gestern';
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 30) return `vor ${Math.floor(days / 7)} Wo.`;
  return new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
