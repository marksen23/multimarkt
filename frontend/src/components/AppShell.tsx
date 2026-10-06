import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { clearAccessToken } from './TokenGate';
import { usePendingActions } from '../contexts/PendingActionsContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true, icon: IconHome, showBadge: true },
  { to: '/ankauf', label: 'Ankauf', end: false, icon: IconSearch, showBadge: false },
  { to: '/bundles', label: 'Bundles', end: false, icon: IconPackage, showBadge: false },
  { to: '/account', label: 'Konto', end: false, icon: IconUser, showBadge: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { pendingCount } = usePendingActions();
  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-surface/90 backdrop-blur border-b border-line sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <NavLink to="/" className="flex items-center gap-2 font-bold text-ink text-sm">
            <span className="w-2 h-2 rounded-full bg-accent" />
            Personal Resale OS
          </NavLink>
          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `relative px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    isActive ? 'bg-accent text-accent-ink' : 'text-ink-muted hover:bg-surface-hover'
                  }`
                }
              >
                {item.label}
                {item.showBadge && pendingCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" aria-hidden="true" />
                )}
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

      {/* Main content — bottom padding on mobile for the bottom nav */}
      <main className="pb-20 sm:pb-0">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 bg-surface/95 backdrop-blur border-t border-line z-20">
        <div className="flex items-stretch">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
                    isActive ? 'text-accent' : 'text-ink-faint'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <Icon active={isActive} />
                      {item.showBadge && pendingCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 border border-surface" aria-hidden="true" />
                      )}
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function IconHome({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function IconSearch({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function IconPackage({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function IconUser({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
