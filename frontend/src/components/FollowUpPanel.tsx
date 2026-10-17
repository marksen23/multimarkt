import { useRef, useState } from "react";
import { copyText } from "../lib/clipboard";
import {
  followUpsApi,
  type FollowUpCard,
  type ItemFollowUp,
} from "../api/follow-ups";
import { formatEur } from "../margin/sale-closeout";
import { Button, Field, inputClass } from "../ui";

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
    <section className="bg-surface border border-line rounded-card shadow-card p-4 space-y-3">
      <h2 className="text-micro uppercase text-ink-muted">Nachfassen</h2>
      {notes.length > 0 && (
        <ul className="space-y-1">
          {notes.map((change) => (
            <li key={change.id} className="text-label font-normal text-ink">
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
      await copyText(card.copyText);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    timer.current = setTimeout(() => setCopyState("idle"), 1800);
  };

  return (
    <div className="space-y-3">
      <p className="text-body text-ink">{card.headline}</p>
      <p className="text-body text-ink">
        Aktueller Preis{" "}
        <span className="font-bold tabular-nums">{formatEur(card.currentPrice)}</span>
      </p>
      <p className="text-body text-ink">{card.suggestionLabel}</p>
      <Field label="Neuer Text, nur zum Kopieren">
        <textarea
          readOnly
          value={card.copyText}
          rows={5}
          className={`${inputClass} resize-none`}
        />
      </Field>
      <p className="text-label font-normal text-ink-muted">
        Die Live-Anzeige bleibt unverändert. Text kopieren, auf dem Portal
        einsetzen, dann den neuen Preis hier eintragen.
      </p>
      <Button
        size="sm"
        variant="secondary"
        icon={copyState === "copied" ? "check" : "copy"}
        onClick={() => void copy()}
      >
        {copyState === "copied"
          ? "Text kopiert"
          : copyState === "error"
            ? "Kopieren nicht möglich"
            : "Text kopieren"}
      </Button>
      <Field label="Neuer Preis">
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          inputMode="decimal"
          className={`${inputClass} tabular-nums`}
        />
      </Field>
      {!priceOk && price.trim() !== "" && (
        <p className="text-label text-danger">
          Der neue Preis muss unter dem bisherigen Preis liegen.
        </p>
      )}
      <Button
        size="sm"
        disabled={busy || !priceOk || parsed == null}
        onClick={() =>
          void onRecord(() =>
            followUpsApi.record(itemId, {
              newPrice: parsed!,
              canonicalListingId: card.listingId,
            }),
          )
        }
      >
        Preis eintragen
      </Button>
    </div>
  );
}
