import { useState } from 'react';
import type { Item } from '../api/types';
import { shippingCostEur, shippingPortalsAllowed, type LogisticsDraft, type LogisticsProfile } from '../logistics/profile';

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
  };

  return (
    <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
      <div>
        <p className="text-xs font-bold text-ink-muted uppercase tracking-wide">Logistikprofil</p>
        <p className="text-[11px] text-ink-faint mt-1">
          Gewicht, Maße, Sperrig, Abholung oder Versand, PLZ. Daraus folgen Kanal und Text.
        </p>
      </div>

      <input
        type="text"
        inputMode="numeric"
        placeholder="Gewicht in g"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        className="w-full p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
      />
      <div className="grid grid-cols-3 gap-2">
        <input
          type="text"
          inputMode="decimal"
          placeholder="Länge cm"
          value={length}
          onChange={(e) => setLength(e.target.value)}
          className="p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
        />
        <input
          type="text"
          inputMode="decimal"
          placeholder="Breite cm"
          value={width}
          onChange={(e) => setWidth(e.target.value)}
          className="p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
        />
        <input
          type="text"
          inputMode="decimal"
          placeholder="Höhe cm"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          className="p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          checked={bulky}
          onChange={(e) => {
            const checked = e.target.checked;
            setBulky(checked);
            if (checked) {
              setPickupOnly(true);
              setShippingPossible(false);
            }
          }}
        />
        Sperrig
      </label>
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          checked={pickupOnly}
          onChange={(e) => {
            const checked = e.target.checked;
            setPickupOnly(checked);
            if (checked) setShippingPossible(false);
          }}
        />
        Nur Abholung
      </label>
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          checked={shippingPossible}
          onChange={(e) => {
            const checked = e.target.checked;
            setShippingPossible(checked);
            if (checked) {
              setPickupOnly(false);
              setBulky(false);
            }
          }}
        />
        Versand möglich
      </label>
      <input
        type="text"
        inputMode="numeric"
        placeholder="PLZ"
        maxLength={5}
        value={postalCode}
        onChange={(e) => setPostalCode(e.target.value)}
        className="w-full p-2 border border-line rounded-lg text-xs outline-none focus:border-accent"
      />

      {!weightOk && <p className="text-xs text-danger">Gewicht als ganze Grammzahl angeben.</p>}
      {!dimensionsOk && <p className="text-xs text-danger">Maße vollständig angeben oder leer lassen.</p>}
      {!postalOk && <p className="text-xs text-danger">PLZ mit fünf Ziffern.</p>}
      {!choice && <p className="text-xs text-ink-faint">Wähle Abholung oder Versand.</p>}
      {choice && ship && (
        <p className="text-xs text-ink-muted">
          Versandportale möglich. Paketkosten {shippingCostEur(preview).toFixed(2)} € aus Gewicht und Maßen.
        </p>
      )}
      {choice && !ship && (
        <p className="text-xs text-ink-muted">Keine Versandportale. Text wird Nur Abholung.</p>
      )}

      <button
        type="button"
        disabled={!canSave}
        onClick={() => void save()}
        className="w-full p-2 rounded-lg bg-accent text-accent-ink text-sm font-bold hover:bg-accent-hover disabled:bg-line disabled:text-ink-faint transition-colors"
      >
        {saved ? 'Logistik gespeichert' : 'Logistik speichern'}
      </button>
    </div>
  );
}
