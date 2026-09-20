const COLORS: Record<string, string> = {
  // Item / Bundle
  NEW: 'bg-gray-100 text-gray-600',
  ANALYZING: 'bg-blue-100 text-blue-700',
  REVIEW_REQUIRED: 'bg-yellow-100 text-yellow-800',
  READY: 'bg-blue-100 text-blue-700',
  BUNDLED: 'bg-purple-100 text-purple-700',
  LISTED: 'bg-indigo-100 text-indigo-700',
  SOLD: 'bg-green-100 text-green-700',
  ARCHIVED: 'bg-gray-100 text-gray-500',
  SALE_CONFLICT: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  // Projection
  DRAFT: 'bg-gray-100 text-gray-600',
  PUBLISHING: 'bg-blue-100 text-blue-700',
  ONLINE: 'bg-green-100 text-green-700',
  CANCEL_PENDING: 'bg-orange-100 text-orange-700',
};

const LABELS: Record<string, string> = {
  NEW: 'Neu',
  ANALYZING: 'Wird analysiert',
  REVIEW_REQUIRED: 'Prüfung nötig',
  READY: 'Bereit',
  BUNDLED: 'Gebündelt',
  LISTED: 'Gelistet',
  SOLD: 'Verkauft',
  ARCHIVED: 'Archiviert',
  SALE_CONFLICT: 'Verkaufskonflikt',
  CANCELLED: 'Storniert',
  DRAFT: 'Entwurf',
  PUBLISHING: 'Wird veröffentlicht',
  ONLINE: 'Online',
  CANCEL_PENDING: 'Storno ausstehend',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${
        COLORS[status] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
