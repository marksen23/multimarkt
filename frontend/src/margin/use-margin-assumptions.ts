import { useEffect, useState } from 'react';
import { accountApi } from '../api/account';
import type { MarginAssumptions } from './expected-margin';

let current: MarginAssumptions | null = null;
let loadPromise: Promise<MarginAssumptions> | null = null;
let saveChain: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function loadAssumptions(): Promise<MarginAssumptions> {
  if (!loadPromise) {
    loadPromise = accountApi.getMarginAssumptions().then((assumptions) => {
      current = assumptions;
      notify();
      return assumptions;
    });
  }
  return loadPromise;
}

export function persistMarginAssumptions(next: MarginAssumptions): Promise<void> {
  current = next;
  notify();
  const run = saveChain.then(() => accountApi.updateMarginAssumptions(next)).then(() => undefined);
  saveChain = run.catch(() => undefined);
  return run;
}

export function flushMarginAssumptions(): Promise<void> {
  return saveChain;
}

export function useMarginAssumptions(): MarginAssumptions | null {
  const [value, setValue] = useState<MarginAssumptions | null>(current);

  useEffect(() => {
    let cancelled = false;
    const listener = () => {
      if (!cancelled) setValue(current);
    };
    listeners.add(listener);
    void loadAssumptions().then(listener);
    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, []);

  return value;
}
