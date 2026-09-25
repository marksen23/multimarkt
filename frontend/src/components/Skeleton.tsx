/**
 * Usability-Ergänzung (September 2026): ersetzt den bisherigen reinen
 * "Lädt…"-Text auf den Haupt-Listenseiten — bei langsamer Verbindung wirkte
 * der Sprung von leerer Fläche zu Inhalt wie ein kurzer Absturz. Platzhalter
 * haben ungefähr die Form des echten Inhalts, damit kein Layout-Sprung
 * entsteht, sobald die echten Daten eintreffen.
 */
export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-line/60 rounded-lg ${className}`} />;
}

export function ItemCardSkeleton() {
  return (
    <div className="bg-surface border border-line rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="w-12 h-12 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-4 w-2/3" />
          <SkeletonBlock className="h-3 w-1/3" />
        </div>
        <SkeletonBlock className="h-5 w-16 rounded-full shrink-0" />
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <ItemCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Generischer Platzhalter für Detailseiten (Bundle/Artikel) vor dem ersten Laden. */
export function DetailPageSkeleton() {
  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <SkeletonBlock className="h-4 w-20" />
        <SkeletonBlock className="h-5 w-16 rounded-full" />
      </div>
      <SkeletonBlock className="h-40 w-full rounded-2xl" />
      <SkeletonBlock className="h-4 w-1/2" />
      <SkeletonBlock className="h-24 w-full rounded-2xl" />
    </div>
  );
}
