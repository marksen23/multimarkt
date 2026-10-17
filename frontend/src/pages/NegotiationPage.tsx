import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';
import type { PriceResearchResult } from '../api/types';
import { NegotiationAssistant } from '../components/NegotiationAssistant';
import { DetailPageSkeleton } from '../components/Skeleton';
import { Card, Icon, Notice } from '../ui';

/**
 * Verhandlung für einen echten Artikel. Die Seite zeigt P_min und P_target
 * aus der Preisrecherche, nicht Beispieldaten.
 */
export function NegotiationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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

  const backButton = (
    <button
      type="button"
      onClick={() => navigate(-1)}
      className="inline-flex items-center gap-1 h-10 pl-1 pr-3 -ml-1 rounded-full text-body text-ink-muted hover:bg-surface-hover hover:text-ink"
    >
      <Icon name="chevronLeft" size={20} />
      Artikel
    </button>
  );

  if (error) {
    return (
      <div className="max-w-md mx-auto p-4 space-y-3">
        {backButton}
        <Notice tone="danger">{error}</Notice>
      </div>
    );
  }
  if (!research) {
    return (
      <div className="max-w-md mx-auto p-4 space-y-3">
        {backButton}
        <DetailPageSkeleton />
      </div>
    );
  }

  const recommendation = research.recommendation;
  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      {backButton}
      {recommendation ? (
        <NegotiationAssistant
          itemId={id}
          title={title}
          targetPrice={recommendation.targetPrice}
          minPrice={recommendation.minPrice}
        />
      ) : (
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Icon name="alert" size={18} className="text-warning shrink-0" />
            <h1 className="text-title text-ink">Verhandlung</h1>
          </div>
          <p className="text-body text-ink-muted">
            Für {title?.trim() || 'diesen Artikel'} fehlen Zielpreis und Schmerzgrenze. Zuerst die
            Preisrecherche auf der Artikelseite ausführen.
          </p>
        </Card>
      )}
    </div>
  );
}
