import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-4">
        <p className="text-5xl font-extrabold text-line select-none">404</p>
        <h1 className="text-lg font-bold text-ink">Seite nicht gefunden</h1>
        <p className="text-sm text-ink-muted">
          Diese URL existiert nicht oder wurde verschoben.
        </p>
        <Link
          to="/"
          className="inline-block px-5 py-2.5 rounded-full bg-accent text-accent-ink text-sm font-bold hover:bg-accent-hover transition-colors"
        >
          ← Zum Dashboard
        </Link>
      </div>
    </div>
  );
}
