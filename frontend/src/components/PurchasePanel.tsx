import { useState } from 'react';
import type { Item } from '../api/types';

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
    <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
      <div>
        <p className="text-xs font-bold text-ink-muted uppercase tracking-wide">Einstand</p>
        <p className="text-[11px] text-ink-faint mt-1">
          Einkauf von Hand: Preis, Portal, Datum, Zustand, Link.
        </p>
      </div>

      {item.purchasePriceEur != null && (
        <p className="text-sm text-ink">
          <span className="font-bold">{item.purchasePriceEur.toFixed(2)} €</span>
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
          className="p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
        />
        <input
          type="text"
          placeholder="Portal"
          value={portal}
          onChange={(e) => setPortal(e.target.value)}
          className="p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="p-2 border border-line rounded-lg text-xs outline-none focus:border-accent bg-surface text-ink"
        />
        <input
          type="text"
          placeholder="Zustand"
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          className="p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
        />
      </div>
      <input
        type="url"
        placeholder="Link zur Anzeige"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="w-full p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
      />
      {item.purchaseUrl && (
        <a
          href={item.purchaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs font-bold text-accent hover:text-accent-hover"
        >
          Anzeige öffnen ↗
        </a>
      )}
      <button
        type="button"
        disabled={busy || !priceValid}
        onClick={() => void save()}
        className="w-full p-2 rounded-lg bg-accent text-accent-ink text-sm font-bold hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
      >
        {saved ? 'Einkauf gespeichert' : 'Einkauf speichern'}
      </button>
    </div>
  );
}
