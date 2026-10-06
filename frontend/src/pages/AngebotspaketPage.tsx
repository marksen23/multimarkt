import { Link, useParams } from 'react-router-dom';
import { ChannelCards } from '../components/ChannelCards';

export function AngebotspaketPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) return null;

  return (
    <div className="max-w-md mx-auto pb-12">
      <div className="p-4 flex items-center justify-between">
        <Link to={`/items/${id}`} className="text-xs text-ink-faint hover:text-ink-muted">
          ← Zurück zum Artikel
        </Link>
        <span className="text-xs font-bold text-ink-muted uppercase tracking-wide">Angebotspaket</span>
      </div>
      <ChannelCards itemId={id} />
    </div>
  );
}
