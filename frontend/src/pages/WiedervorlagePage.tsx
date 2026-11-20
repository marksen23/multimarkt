import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { markdownApi, type AttentionCard } from '../api/markdown';
import { ApiRequestError } from '../api/client';
import { ListSkeleton } from '../components/Skeleton';
import { formatEuro } from '../lib/format';
import { Button, ButtonLink, Card, EmptyState, Notice, PageHeader } from '../ui';

export function WiedervorlagePage() {
  const [cards, setCards] = useState<AttentionCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    markdownApi
      .attention()
      .then((next) => {
        setCards(next);
        setError(null);
      })
      .catch((caught) => {
        setError(caught instanceof ApiRequestError ? caught.body.message : 'Die Wiedervorlage ist gerade nicht erreichbar.');
      });
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-4">
      <PageHeader
        title="Wiedervorlage"
        subtitle="Artikel, die länger online sind und noch nicht verkauft wurden."
      />
      {error && <Notice tone="danger">{error}</Notice>}
      {cards === null && !error && <ListSkeleton />}
      {cards && cards.length === 0 && (
        <EmptyState icon="check" title="Nichts liegt vor" text="Kein Artikel ist lange genug online, um hier aufzutauchen." />
      )}
      {cards?.map((card) => (
        <AttentionRow key={card.itemId} card={card} />
      ))}
    </div>
  );
}

function AttentionRow({ card }: { card: AttentionCard }) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rerun = async () => {
    setBusy(true);
    setNote(null);
    try {
      const result = await itemsApi.priceResearch(card.itemId, true, 'FAST_SALE');
      const floor = result.recommendation?.minPrice;
      setNote(
        floor
          ? `Vergleich neu gerechnet. Mindestpreis aus dem Vorschlag: ${formatEuro(floor)}.`
          : result.notice ?? 'Vergleich gerechnet. Ein Mindestpreis kam nicht zurück.',
      );
    } catch (caught) {
      setNote(caught instanceof ApiRequestError ? caught.body.message : 'Der Vergleich ist gerade nicht erreichbar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-title text-ink">{card.title ?? 'Unbenannter Artikel'}</h2>
          <p className="text-label font-normal text-ink-muted">
            Seit {card.daysOnline} Tagen online · {formatEuro(card.currentPrice)}
          </p>
        </div>
        <ButtonLink to={`/items/${card.itemId}`} variant="secondary" size="sm">
          Öffnen
        </ButtonLink>
      </div>
      <ul className="space-y-2">
        {card.suggestions.map((suggestion) => (
          <li key={suggestion.kind}>
            <p className="text-body font-semibold text-ink">{suggestion.title}</p>
            <p className="text-label font-normal text-ink-muted">{suggestion.detail}</p>
          </li>
        ))}
      </ul>
      {note && <Notice tone="info">{note}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" loading={busy} disabled={busy} onClick={() => void rerun()}>
          Analyse erneut ausführen
        </Button>
        <Link to={`/items/${card.itemId}`} className="inline-flex items-center h-8 px-3 text-label text-accent">
          Fotos prüfen
        </Link>
      </div>
    </Card>
  );
}
