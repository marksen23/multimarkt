import { createContext, useContext, useState, type ReactNode } from 'react';

interface PendingActionsContextValue {
  pendingCount: number;
  setPendingCount: (count: number) => void;
}

const PendingActionsContext = createContext<PendingActionsContextValue>({
  pendingCount: 0,
  setPendingCount: () => {},
});

export function PendingActionsProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  return (
    <PendingActionsContext.Provider value={{ pendingCount, setPendingCount }}>
      {children}
    </PendingActionsContext.Provider>
  );
}

export function usePendingActions() {
  return useContext(PendingActionsContext);
}
