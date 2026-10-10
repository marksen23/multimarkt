import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { clearAccessToken } from './TokenGate';
import { usePendingActions } from '../contexts/PendingActionsContext';

// ── Navigation config ──────────────────────────────────────────────────────────

interface DesktopNavItem {
  to: string;
  label: string;
  end: boolean;
  icon: (props: { active: boolean }) => React.ReactElement;
  showBadge: boolean;
}

interface MobileNavItem {
  to: string;
  label: string;
  end: boolean;
  icon: ((props: { active: boolean }) => React.ReactElement) | null;
  showBadge: boolean;
  cta: boolean;
}

const SIDEBAR_NAV: DesktopNavItem[] = [
  { to: '/',        label: 'Dashboard', end: true,  icon: IconHome,    showBadge: true  },
  { to: '/ankauf',  label: 'Ankauf',    end: false, icon: IconSearch,  showBadge: false },
  { to: '/bundles', label: 'Bundles',   end: false, icon: IconPackage, showBadge: false },
  { to: '/account', label: 'Konto',     end: false, icon: IconUser,    showBadge: false },
];

const BOTTOM_NAV: MobileNavItem[] = [
  { to: '/',        label: 'Dashboard', end: true,  icon: IconHome,    showBadge: true,  cta: false },
  { to: '/ankauf',  label: 'Ankauf',    end: false, icon: IconSearch,  showBadge: false, cta: false },
  { to: '/new',     label: 'Neu',       end: false, icon: null,        showBadge: false, cta: true  },
  { to: '/bundles', label: 'Bundles',   end: false, icon: IconPackage, showBadge: false, cta: false },
  { to: '/account', label: 'Konto',     end: false, icon: IconUser,    showBadge: false, cta: false },
];

// ── AppShell ───────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: ReactNode }) {
  const { pendingCount } = usePendingActions();
  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleLogout = () => {
    if (confirmLogout) {
      clearAccessToken();
    } else {
      setConfirmLogout(true);
      setTimeout(() => setConfirmLogout(false), 3000);
    }
  };

  return (
    <div className="flex min-h-screen bg-bg">

      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden sm:flex flex-col w-60 shrink-0 bg-surface border-r border-line sticky top-0 h-screen overflow-y-auto">

        {/* Wordmark */}
        <div className="px-5 pt-6 pb-5 flex-shrink-0">
          <Link to="/" className="flex items-center gap-3 group outline-none">
            <LogoMark className="w-8 h-8 text-accent shrink-0" />
            <span className="text-[13px] font-bold text-ink tracking-tight leading-tight group-hover:text-accent transition-colors">
              Personal Resale OS
            </span>
          </Link>
        </div>

        {/* Primary CTA */}
        <div className="px-4 pb-5 flex-shrink-0">
          <Link
            to="/new"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-accent text-accent-ink text-sm font-bold hover:bg-accent-hover active:scale-[0.97] transition-all shadow-sm"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Neuer Artikel
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3" aria-label="Hauptnavigation">
          <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint select-none">
            Navigation
          </p>
          <ul className="space-y-0.5">
            {SIDEBAR_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        isActive
                          ? 'bg-accent text-accent-ink font-semibold'
                          : 'text-ink-muted font-medium hover:bg-surface-hover hover:text-ink'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon active={isActive} />
                        <span className="flex-1">{item.label}</span>
                        {item.showBadge && pendingCount > 0 && (
                          <span
                            className={`tabular-nums text-[10px] font-bold min-w-[1.25rem] h-5 flex items-center justify-center rounded-full px-1 ${
                              isActive
                                ? 'bg-white/25 text-accent-ink'
                                : 'bg-accent text-accent-ink'
                            }`}
                            aria-label={`${pendingCount} ausstehende Aktionen`}
                          >
                            {pendingCount}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Sidebar footer */}
        <div className="flex-shrink-0 p-3 mt-auto border-t border-line">
          <button
            type="button"
            onClick={handleLogout}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              confirmLogout
                ? 'bg-danger-soft text-danger font-semibold'
                : 'text-ink-faint hover:bg-surface-hover hover:text-ink-muted'
            }`}
          >
            <IconLogout />
            <span>{confirmLogout ? 'Wirklich abmelden?' : 'Abmelden'}</span>
          </button>
        </div>
      </aside>

      {/* ── Content area ────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <main className="pb-24 sm:pb-0">{children}</main>
      </div>

      {/* ── Mobile bottom navigation ────────────────────────────────────── */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-surface/95 backdrop-blur-sm border-t border-line"
        aria-label="Hauptnavigation"
      >
        <div className="flex items-end h-[60px]">
          {BOTTOM_NAV.map((item) => {
            /* Centre FAB ─ "Neu" */
            if (item.cta) {
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-label="Neuer Artikel"
                  className="flex-1 flex justify-center items-center pb-2"
                >
                  <span className="flex items-center justify-center w-12 h-12 rounded-full bg-accent text-accent-ink shadow-lg -translate-y-4 active:scale-95 transition-transform">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </Link>
              );
            }

            /* Regular tab */
            const Icon = item.icon!;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center justify-center gap-[3px] py-2 text-[10px] font-semibold transition-colors outline-none ${
                    isActive ? 'text-accent' : 'text-ink-faint'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <Icon active={isActive} />
                      {item.showBadge && pendingCount > 0 && (
                        <span
                          className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 border-2 border-surface"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
        {/* iOS home-indicator clearance */}
        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      </nav>
    </div>
  );
}

// ── Logo mark (2 × 2 grid — represents portfolio/marketplace) ─────────────────

function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="2"  y="2"  width="11" height="11" rx="3" fill="currentColor" />
      <rect x="15" y="2"  width="11" height="11" rx="3" fill="currentColor" opacity="0.35" />
      <rect x="2"  y="15" width="11" height="11" rx="3" fill="currentColor" opacity="0.35" />
      <rect x="15" y="15" width="11" height="11" rx="3" fill="currentColor" />
    </svg>
  );
}

// ── Navigation icons (18 × 18, consistent stroke) ─────────────────────────────

function IconHome({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function IconSearch({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function IconPackage({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function IconUser({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
