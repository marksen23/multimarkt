import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { ItemListEntry } from '../api/types';
import { isTodo } from '../lib/todo';

interface ItemsContextValue {
  entries: ItemListEntry[] | null;
  error: string | null;
  refresh: () => void;
  /** Artikel, bei denen der Nutzer selbst handeln muss (Badge an „Heute“). */
  pendingCount: number;
}

const ItemsContext = createContext<ItemsContextValue | null>(null);


export function ItemsProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ItemListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    itemsApi
      .list()
      .then((list) => {
        setEntries(list);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler'));
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const value = useMemo(
    () => ({
      entries,
      error,
      refresh,
      pendingCount: entries?.filter(isTodo).length ?? 0,
    }),
    [entries, error, refresh],
  );

  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>;
}

export function useItems() {
  const ctx = useContext(ItemsContext);
  if (!ctx) throw new Error('useItems must be used inside ItemsProvider');
  return ctx;
}
