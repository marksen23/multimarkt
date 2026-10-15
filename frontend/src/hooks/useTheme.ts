import { useEffect, useState } from 'react';

export type ThemePreference = 'auto' | 'dark' | 'light';

const CYCLE: ThemePreference[] = ['auto', 'dark', 'light'];

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePreference>(() => {
    try {
      return (localStorage.getItem('theme') as ThemePreference) ?? 'auto';
    } catch {
      return 'auto';
    }
  });

  useEffect(() => {
    if (pref === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', pref);
    }
    try {
      localStorage.setItem('theme', pref);
    } catch {}
  }, [pref]);

  const setPref = (next: ThemePreference) => setPrefState(next);

  const cycle = () => {
    const idx = CYCLE.indexOf(pref);
    setPrefState(CYCLE[(idx + 1) % CYCLE.length]);
  };

  return { pref, setPref, cycle };
}
