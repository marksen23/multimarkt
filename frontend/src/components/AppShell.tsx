import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { clearAccessToken } from './TokenGate';
import { useItems } from '../contexts/ItemsContext';
import { Icon, type IconName } from '../ui';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  badge?: boolean;
  /** Weitere Pfade, unter denen der Eintrag als aktiv gilt (mobil „Mehr“). */
  alsoActive?: string[];
}

const SIDEBAR_NAV: NavItem[] = [
  { to: '/', label: 'Heute', icon: 'inbox', end: true, badge: true },
  { to: '/bestand', label: 'Bestand', icon: 'layers' },
  { to: '/ankauf', label: 'Ankauf', icon: 'search' },
  { to: '/bundles', label: 'Bundles', icon: 'package' },
  { to: '/verkaeufe', label: 'Verkäufe', icon: 'euro' },
  { to: '/sicherung', label: 'Sicherung', icon: 'download' },
  { to: '/account', label: 'Konto', icon: 'user' },
];

const BOTTOM_LEFT: NavItem[] = [
  { to: '/', label: 'Heute', icon: 'inbox', end: true, badge: true },
  { to: '/bestand', label: 'Bestand', icon: 'layers' },
];
const BOTTOM_RIGHT: NavItem[] = [
  { to: '/ankauf', label: 'Ankauf', icon: 'search' },
  { to: '/mehr', label: 'Mehr', icon: 'grid', alsoActive: ['/bundles', '/account', '/verkaeufe', '/sicherung'] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { pendingCount } = useItems();
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
      <aside className="hidden sm:flex flex-col w-60 shrink-0 bg-surface border-r border-line sticky top-0 h-screen overflow-y-auto">
        <Link to="/" className="flex items-center gap-3 px-5 pt-6 pb-5 group outline-none">
          <LogoMark className="w-8 h-8 text-accent" />
          <span className="text-body font-bold text-ink tracking-tight group-hover:text-accent transition-colors">
            Resale OS
          </span>
        </Link>

        <div className="px-4 pb-5">
          <Link
            to="/new"
            className="flex items-center justify-center gap-2 h-11 rounded-control bg-accent text-accent-ink text-body font-semibold hover:bg-accent-hover active:scale-[0.98] transition-all shadow-card"
          >
            <Icon name="camera" size={17} />
            Artikel erfassen
          </Link>
        </div>

        <nav className="flex-1 px-3" aria-label="Hauptnavigation">
          <ul className="space-y-0.5">
            {SIDEBAR_NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 h-10 rounded-control text-body transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      isActive
                        ? 'bg-accent-soft text-accent font-semibold'
                        : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon name={item.icon} strokeWidth={isActive ? 2.2 : 1.8} />
                      <span className="flex-1">{item.label}</span>
                      {item.badge && pendingCount > 0 && <CountBadge count={pendingCount} />}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-3 border-t border-line">
          <button
            type="button"
            onClick={handleLogout}
            className={`flex items-center gap-3 w-full px-3 h-10 rounded-control text-body transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              confirmLogout ? 'bg-danger-soft text-danger font-semibold' : 'text-ink-faint hover:bg-surface-hover hover:text-ink-muted'
            }`}
          >
            <Icon name="logout" />
            {confirmLogout ? 'Wirklich abmelden? Nochmal tippen' : 'Abmelden'}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <main className="pb-[calc(76px+env(safe-area-inset-bottom,0px))] sm:pb-0">{children}</main>
      </div>

      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-surface/95 backdrop-blur-md border-t border-line"
        aria-label="Hauptnavigation"
      >
        <div className="flex items-stretch h-[60px]">
          {BOTTOM_LEFT.map((item) => (
            <BottomTab key={item.to} item={item} pendingCount={pendingCount} />
          ))}
          <Link to="/new" aria-label="Artikel erfassen" className="flex-1 flex justify-center">
            <span className="flex items-center justify-center w-14 h-14 rounded-full bg-accent text-accent-ink shadow-float -translate-y-4 ring-4 ring-bg active:scale-95 transition-transform">
              <Icon name="camera" size={24} strokeWidth={2} />
            </span>
          </Link>
          {BOTTOM_RIGHT.map((item) => (
            <BottomTab key={item.to} item={item} pendingCount={pendingCount} />
          ))}
        </div>
        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      </nav>
    </div>
  );
}

function BottomTab({ item, pendingCount }: { item: NavItem; pendingCount: number }) {
  const { pathname } = useLocation();
  const extraActive = item.alsoActive?.some((p) => pathname.startsWith(p)) ?? false;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      aria-current={extraActive ? 'page' : undefined}
      className={({ isActive }) =>
        `flex-1 flex flex-col items-center justify-center gap-1 text-micro normal-case tracking-normal transition-colors outline-none ${
          isActive || extraActive ? 'text-accent' : 'text-ink-faint'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className="relative">
            <Icon name={item.icon} size={22} strokeWidth={isActive || extraActive ? 2.2 : 1.8} />
            {item.badge && pendingCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5">
                <CountBadge count={pendingCount} />
              </span>
            )}
          </span>
          {item.label}
        </>
      )}
    </NavLink>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span
      className="tabular-nums text-micro tracking-normal min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-accent text-accent-ink ring-2 ring-surface"
      aria-label={`${count} offene Aufgaben`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={`shrink-0 ${className ?? ''}`} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="11" height="11" rx="3" fill="currentColor" />
      <rect x="15" y="2" width="11" height="11" rx="3" fill="currentColor" opacity="0.35" />
      <rect x="2" y="15" width="11" height="11" rx="3" fill="currentColor" opacity="0.35" />
      <rect x="15" y="15" width="11" height="11" rx="3" fill="currentColor" />
    </svg>
  );
}
