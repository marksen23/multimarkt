import { ButtonLink, EmptyState } from '../ui';

export function NotFoundPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <EmptyState
          icon="search"
          title="Seite nicht gefunden"
          text="Diese URL existiert nicht oder wurde verschoben."
          action={<ButtonLink to="/">Zu Heute</ButtonLink>}
        />
      </div>
    </div>
  );
}
