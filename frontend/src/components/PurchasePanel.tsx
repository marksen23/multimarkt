import { useState } from 'react';
import type { Item } from '../api/types';
import { Button, Card, Icon, inputClass } from '../ui';

export interface PurchaseDraft {
  price: number | null;
  portal: string | null;
  date: string | null;
  condition: string | null;
  url: string | null;
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  if (!year || !month || !day) return iso;
  return `${day}.${month}.${year}`;
}

export function PurchasePanel({
  item,
  busy,
  onSave,
}: {
  item: Item;
  busy: boolean;
  onSave: (draft: PurchaseDraft) => Promise<void>;
}) {
  const [price, setPrice] = useState(item.purchasePriceEur == null ? '' : String(item.purchasePriceEur));
  const [portal, setPortal] = useState(item.purchasePortal ?? '');
  const [date, setDate] = useState(item.purchaseDate ? item.purchaseDate.slice(0, 10) : '');
  const [condition, setCondition] = useState(item.purchaseCondition ?? '');
  const [url, setUrl] = useState(item.purchaseUrl ?? '');
  const [saved, setSaved] = useState(false);

  const priceNumber = price.trim() === '' ? null : Number(price.replace(',', '.'));
  const priceValid = priceNumber != null && Number.isFinite(priceNumber) && priceNumber >= 0;

  const save = async () => {
    if (!priceValid || priceNumber == null) return;
    setSaved(false);
    await onSave({
      price: priceNumber,
      portal: portal.trim() || null,
      date: date || null,
      condition: condition.trim() || null,
      url: url.trim() || null,
    });
    setSaved(true);
  };

  return (
    <Card className="p-4 space-y-3">
      <div>
        <p className="text-micro uppercase text-ink-muted">Einstand</p>
        <p className="text-label font-normal text-ink-faint mt-1">
          Einkauf von Hand: Preis, Portal, Datum, Zustand, Link.
        </p>
      </div>

      {item.purchasePriceEur != null && (
        <p className="text-body text-ink">
          <span className="font-bold tabular-nums">{item.purchasePriceEur.toFixed(2)} €</span>
          {item.purchasePortal ? ` · ${item.purchasePortal}` : ''}
          {item.purchaseDate ? ` · ${formatDate(item.purchaseDate)}` : ''}
          {item.purchaseCondition ? ` · ${item.purchaseCondition}` : ''}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          inputMode="decimal"
          placeholder="Preis in €"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={inputClass}
        />
        <input
          type="text"
          placeholder="Portal"
          value={portal}
          onChange={(e) => setPortal(e.target.value)}
          className={inputClass}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputClass}
        />
        <input
          type="text"
          placeholder="Zustand"
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          className={inputClass}
        />
      </div>
      <input
        type="url"
        placeholder="Link zur Anzeige"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className={inputClass}
      />
      {item.purchaseUrl && (
        <a
          href={item.purchaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-label text-accent hover:text-accent-hover"
        >
          Anzeige öffnen
          <Icon name="external" size={14} />
        </a>
      )}
      <Button block size="md" disabled={busy || !priceValid} onClick={() => void save()}>
        {saved ? 'Einkauf gespeichert' : 'Einkauf speichern'}
      </Button>
    </Card>
  );
}
