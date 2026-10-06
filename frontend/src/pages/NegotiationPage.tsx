import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { PriceResearchResult } from '../api/types';
import { NegotiationAssistant } from '../components/NegotiationAssistant';
import { DetailPageSkeleton } from '../components/Skeleton';

/**
 * Verhandlung für einen echten Artikel. Die Seite zeigt P_min und P_target
 * aus der Preisrecherche, nicht Beispieldaten.
 */
export function NegotiationPage() {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState<string | null>(null);
  const [research, setResearch] = useState<PriceResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([itemsApi.get(id), itemsApi.priceResearch(id)])
      .then(([detail, prices]) => {
        if (cancelled) return;
        setTitle(detail.item.title);
        setResearch(prices);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return null;
  if (error) {
    return (
      <div className="max-w-md mx-auto p-4 space-y-3">
        <BackLink itemId={id} />
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }
  if (!research) {
    return (
      <div className="max-w-md mx-auto p-4">
        <DetailPageSkeleton />
      </div>
    );
  }

  const recommendation = research.recommendation;
  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <BackLink itemId={id} />
      {recommendation ? (
        <NegotiationAssistant
          itemId={id}
          title={title}
          targetPrice={recommendation.targetPrice}
          minPrice={recommendation.minPrice}
        />
      ) : (
        <div className="bg-surface border border-line rounded-2xl p-4 space-y-2">
          <h1 className="text-lg font-bold text-ink">Verhandlung</h1>
          <p className="text-sm text-ink-muted">
            Für {title?.trim() || 'diesen Artikel'} fehlen Zielpreis und Schmerzgrenze. Zuerst die
            Preisrecherche auf der Artikelseite ausführen.
          </p>
        </div>
      )}
    </div>
  );
}

function BackLink({ itemId }: { itemId: string }) {
  return (
    <Link to={`/items/${itemId}`} className="text-xs text-ink-faint hover:text-ink-muted">
      ← Artikel
    </Link>
  );
}
