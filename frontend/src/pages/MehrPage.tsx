import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clearAccessToken } from '../components/TokenGate';
import { Card, Icon, PageHeader, type IconName } from '../ui';

const LINKS: { to: string; icon: IconName; title: string; text: string }[] = [
  { to: '/bundles', icon: 'package', title: 'Bundles', text: 'Mehrere Artikel als Paket verkaufen' },
  { to: '/verkaeufe', icon: 'euro', title: 'Verkäufe', text: 'Monatsauswertung und abgeschlossene Verkäufe' },
  { to: '/sicherung', icon: 'download', title: 'Sicherung', text: 'Bestand exportieren und Fotos sichern' },
  { to: '/account', icon: 'user', title: 'Konto & Einstellungen', text: 'Statistik, Darstellung, Daten löschen' },
];

export function MehrPage() {
  const [confirmLogout, setConfirmLogout] = useState(false);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-4">
      <PageHeader title="Mehr" />
      <Card className="divide-y divide-line overflow-hidden">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="flex items-center gap-3 p-4 hover:bg-surface-hover transition-colors">
            <span className="w-10 h-10 rounded-control bg-surface-hover text-ink-muted flex items-center justify-center">
              <Icon name={l.icon} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-body font-semibold text-ink">{l.title}</p>
              <p className="text-label font-normal text-ink-faint">{l.text}</p>
            </div>
            <Icon name="chevronRight" className="text-ink-faint" />
          </Link>
        ))}
        <button
          type="button"
          onClick={() => {
            if (confirmLogout) clearAccessToken();
            else {
              setConfirmLogout(true);
              setTimeout(() => setConfirmLogout(false), 3000);
            }
          }}
          className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${
            confirmLogout ? 'bg-danger-soft text-danger' : 'text-ink-muted hover:bg-surface-hover'
          }`}
        >
          <span className="w-10 h-10 rounded-control bg-surface-hover flex items-center justify-center">
            <Icon name="logout" />
          </span>
          <span className="text-body font-semibold">{confirmLogout ? 'Wirklich abmelden? Nochmal tippen' : 'Abmelden'}</span>
        </button>
      </Card>
      <p className="text-label font-normal text-ink-faint text-center">Resale OS · Einzelnutzer-Modus</p>
    </div>
  );
}
