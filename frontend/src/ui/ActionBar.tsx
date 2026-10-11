import type { ReactNode } from 'react';

/** Hält die eine Primäraktion eines Screens im Daumenbereich, oberhalb der mobilen Navigation. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-above-nav z-10 -mx-4 px-4 pt-6 pb-3 bg-gradient-to-t from-bg via-bg/95 to-transparent">
      <div className="flex gap-2 [&>*]:flex-1">{children}</div>
    </div>
  );
}
