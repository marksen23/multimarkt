import { useState } from 'react';
import type { Item } from '../api/types';
import { handoverFlags, handoverFrom, type Handover } from '../logistics/handover';
import { shippingCostEur, shippingPortalsAllowed, type LogisticsDraft, type LogisticsProfile } from '../logistics/profile';
import { Button, Card, Notice, inputClass } from '../ui';

function parseGrams(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return Number.NaN;
  return Number(trimmed);
}

function parseCm(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return Number.NaN;
  return Math.round(value * 10) / 10;
}

function formatCm(value: number | null): string {
  if (value == null) return '';
  return String(value);
}

export function LogisticsProfileForm({
  item,
  busy,
  onSave,
}: {
  item: Item;
  busy: boolean;
  onSave: (draft: LogisticsDraft) => Promise<void>;
}) {
  const [weight, setWeight] = useState(item.weightGrams == null ? '' : String(item.weightGrams));
  const [length, setLength] = useState(formatCm(item.lengthCm));
  const [width, setWidth] = useState(formatCm(item.widthCm));
  const [height, setHeight] = useState(formatCm(item.heightCm));
  const [bulky, setBulky] = useState(item.logisticsBulky);
  const [pickupOnly, setPickupOnly] = useState(item.pickupOnly);
  const [shippingPossible, setShippingPossible] = useState(item.shippingPossible);
  const [postalCode, setPostalCode] = useState(item.postalCode ?? '');
  const [saved, setSaved] = useState(false);
  const [showMeasures, setShowMeasures] = useState(
    () =>
      item.weightGrams != null ||
      item.lengthCm != null ||
      item.widthCm != null ||
      item.heightCm != null ||
      Boolean(item.postalCode),
  );

  const weightGrams = parseGrams(weight);
  const lengthCm = parseCm(length);
  const widthCm = parseCm(width);
  const heightCm = parseCm(height);
  const dimensions = [lengthCm, widthCm, heightCm];
  const anyDimension = dimensions.some((value) => value != null && !Number.isNaN(value));
  const allDimensions =
    dimensions.every((value) => value != null && !Number.isNaN(value) && value >= 0.1 && value <= 1000);
  const dimensionsOk = !anyDimension || allDimensions;
  const weightOk = weightGrams == null || (weightGrams >= 1 && weightGrams <= 500_000);
  const postalOk = postalCode.trim() === '' || /^\d{5}$/.test(postalCode.trim());
  const choice = bulky || pickupOnly || shippingPossible;
  const handover = handoverFrom({ bulky, pickupOnly, shippingPossible });

  const choose = (mode: Handover) => {
    const next = handoverFlags(mode);
    setBulky(next.bulky);
    setPickupOnly(next.pickupOnly);
    setShippingPossible(next.shippingPossible);
  };
  const canSave = weightOk && dimensionsOk && postalOk && choice && !busy;

  const preview: LogisticsProfile = {
    captured: true,
    weightGrams: weightOk ? weightGrams : null,
    lengthCm: allDimensions ? lengthCm : null,
    widthCm: allDimensions ? widthCm : null,
    heightCm: allDimensions ? heightCm : null,
    bulky,
    pickupOnly,
    shippingPossible,
    postalCode: postalOk && postalCode.trim() ? postalCode.trim() : null,
  };
  const ship = choice && shippingPortalsAllowed(preview);

  const save = async () => {
    if (!canSave) return;
    setSaved(false);
    await onSave({
      weightGrams,
      lengthCm: anyDimension ? lengthCm : null,
      widthCm: anyDimension ? widthCm : null,
      heightCm: anyDimension ? heightCm : null,
      bulky,
      pickupOnly,
      shippingPossible,
      postalCode: postalCode.trim() || null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Card className="p-4 space-y-3">
      <div>
        <p className="text-micro uppercase text-ink-muted">Versand und Abholung</p>
        <p className="text-label font-normal text-ink-faint mt-1">
          Eine Wahl. Daraus folgen Kanal und Text. Maße nur, wenn du sie weißt.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Abholung oder Versand">
        <button
          type="button"
          aria-pressed={handover === 'pickup' || handover === 'bulky'}
          onClick={() => choose(bulky ? 'bulky' : 'pickup')}
          className={`h-11 rounded-control border text-body font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            handover === 'pickup' || handover === 'bulky'
              ? 'bg-accent text-accent-ink border-accent'
              : 'bg-surface text-ink-muted border-line'
          }`}
        >
          Abholung
        </button>
        <button
          type="button"
          aria-pressed={handover === 'shipping'}
          onClick={() => choose('shipping')}
          className={`h-11 rounded-control border text-body font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            handover === 'shipping'
              ? 'bg-accent text-accent-ink border-accent'
              : 'bg-surface text-ink-muted border-line'
          }`}
        >
          Versand
        </button>
      </div>
      <label className="flex items-center gap-2 text-body text-ink-muted">
        <input
          type="checkbox"
          className="accent-accent"
          checked={bulky}
          onChange={(event) => choose(event.target.checked ? 'bulky' : 'pickup')}
        />
        Sperrig, nur Abholung
      </label>

      <button
        type="button"
        aria-expanded={showMeasures}
        onClick={() => setShowMeasures((open) => !open)}
        className="text-label text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-control"
      >
        {showMeasures ? 'Maße ausblenden' : 'Maße und PLZ, optional'}
      </button>
      {showMeasures && (
        <div className="space-y-2">
          <input
            type="text"
            inputMode="numeric"
            aria-label="Gewicht in Gramm"
            placeholder="Gewicht in g"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className={inputClass}
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              inputMode="decimal"
              aria-label="Länge in cm"
              placeholder="Länge cm"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              inputMode="decimal"
              aria-label="Breite in cm"
              placeholder="Breite cm"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              inputMode="decimal"
              aria-label="Höhe in cm"
              placeholder="Höhe cm"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className={inputClass}
            />
          </div>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            aria-label="Postleitzahl"
            placeholder="PLZ"
            maxLength={5}
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            className={inputClass}
          />
        </div>
      )}

      {!weightOk && <Notice tone="danger">Gewicht als ganze Grammzahl angeben.</Notice>}
      {!dimensionsOk && <Notice tone="danger">Maße vollständig angeben oder leer lassen.</Notice>}
      {!postalOk && <Notice tone="danger">PLZ mit fünf Ziffern.</Notice>}
      {!choice && <p className="text-label font-normal text-ink-faint">Wähle Abholung oder Versand.</p>}
      {choice && ship && (
        <p className="text-label font-normal text-ink-muted">
          Versandportale möglich. Paketkosten {shippingCostEur(preview).toFixed(2)} € aus Gewicht und Maßen.
        </p>
      )}
      {choice && !ship && (
        <p className="text-label font-normal text-ink-muted">Keine Versandportale. Text wird Nur Abholung.</p>
      )}

      <Button block size="md" loading={busy} disabled={!canSave} icon={saved ? 'check' : undefined} onClick={() => void save()}>
        {saved ? 'Logistik gespeichert' : 'Logistik speichern'}
      </Button>
    </Card>
  );
}
