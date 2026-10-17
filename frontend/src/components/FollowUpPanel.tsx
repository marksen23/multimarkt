import { useRef, useState } from "react";
import {
  followUpsApi,
  type FollowUpCard,
  type ItemFollowUp,
} from "../api/follow-ups";
import { formatEur } from "../margin/sale-closeout";

function parsePrice(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (normalized === "" || normalized === ".") return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

/**
 * Nachfassen (Feature-Plan 3.6). Der neue Text ist nur zum Kopieren.
 * Der Preis wird erst eingetragen, wenn du ihn bestätigst. Die Live-Anzeige
 * bleibt unverändert.
 */
export function FollowUpPanel({
  itemId,
  followUp,
  busy,
  onRecord,
}: {
  itemId: string;
  followUp: ItemFollowUp;
  busy: boolean;
  onRecord: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const card = followUp.followUp;
  const notes = followUp.priceChanges;

  if (!card && notes.length === 0) return null;

  return (
    <section className="bg-surface border border-line rounded-2xl p-4 space-y-3">
      <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">
        Nachfassen
      </h2>
      {notes.length > 0 && (
        <ul className="space-y-1">
          {notes.map((change) => (
            <li key={change.id} className="text-xs text-ink">
              {change.note}. Vorher {formatEur(change.previousPrice)}.
            </li>
          ))}
        </ul>
      )}
      {card && (
        <FollowUpForm
          key={`${card.listingId}-${card.stage}-${card.suggestedPrice}`}
          itemId={itemId}
          card={card}
          busy={busy}
          onRecord={onRecord}
        />
      )}
    </section>
  );
}

function FollowUpForm({
  itemId,
  card,
  busy,
  onRecord,
}: {
  itemId: string;
  card: FollowUpCard;
  busy: boolean;
  onRecord: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [price, setPrice] = useState(String(card.suggestedPrice));
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parsed = parsePrice(price);
  const priceOk = parsed != null && parsed < card.currentPrice;

  const copy = async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(card.copyText);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    timer.current = setTimeout(() => setCopyState("idle"), 1800);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink">{card.headline}</p>
      <p className="text-sm text-ink">
        Aktueller Preis{" "}
        <span className="font-bold">{formatEur(card.currentPrice)}</span>
      </p>
      <p className="text-sm text-ink">{card.suggestionLabel}</p>
      <label className="block space-y-1">
        <span className="block text-[10px] font-bold text-ink-faint uppercase">
          Neuer Text, nur zum Kopieren
        </span>
        <textarea
          readOnly
          value={card.copyText}
          rows={5}
          className="w-full p-2 border border-line rounded-lg text-xs text-ink bg-surface-hover outline-none"
        />
      </label>
      <p className="text-xs text-ink-muted">
        Die Live-Anzeige bleibt unverändert. Text kopieren, auf dem Portal
        einsetzen, dann den neuen Preis hier eintragen.
      </p>
      <button
        type="button"
        onClick={() => void copy()}
        className="text-[11px] font-bold px-2 py-1 rounded-lg bg-surface-hover text-ink-muted hover:bg-line transition-colors"
      >
        {copyState === "copied"
          ? "Text kopiert"
          : copyState === "error"
            ? "Kopieren nicht möglich"
            : "Text kopieren"}
      </button>
      <label className="block space-y-1">
        <span className="block text-[10px] font-bold text-ink-faint uppercase">
          Neuer Preis
        </span>
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          inputMode="decimal"
          className="w-full p-2 border border-line rounded-lg text-sm text-ink outline-none focus:border-accent"
        />
      </label>
      {!priceOk && price.trim() !== "" && (
        <p className="text-xs text-danger">
          Der neue Preis muss unter dem bisherigen Preis liegen.
        </p>
      )}
      <button
        type="button"
        disabled={busy || !priceOk || parsed == null}
        onClick={() =>
          void onRecord(() =>
            followUpsApi.record(itemId, {
              newPrice: parsed!,
              canonicalListingId: card.listingId,
            }),
          )
        }
        className="text-[11px] font-bold px-2 py-1 rounded-lg bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
      >
        Preis eintragen
      </button>
    </div>
  );
}
