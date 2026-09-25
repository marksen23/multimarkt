import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { clearAccessToken } from './TokenGate';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/bundles', label: 'Bundles', end: false },
  { to: '/account', label: 'Konto', end: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-surface/90 backdrop-blur border-b border-line sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <NavLink to="/" className="flex items-center gap-2 font-bold text-ink text-sm">
            <span className="w-2 h-2 rounded-full bg-accent" />
            Personal Resale OS
          </NavLink>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    isActive ? 'bg-accent text-accent-ink' : 'text-ink-muted hover:bg-surface-hover'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={clearAccessToken}
              className="px-3 py-1.5 rounded-full text-xs font-semibold text-ink-faint hover:bg-surface-hover hover:text-ink-muted transition-colors"
              title="Zugriffstoken entfernen"
            >
              Abmelden
            </button>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
