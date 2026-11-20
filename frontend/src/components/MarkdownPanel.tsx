import { useCallback, useEffect, useState } from 'react';
import { markdownApi, type ItemMarkdown, type MarkdownSettings } from '../api/markdown';
import { ApiRequestError } from '../api/client';
import { useToast } from './Toast';
import { MarkdownTaskList } from './MarkdownTaskList';
import { formatEuro } from '../lib/format';
import { Button, Field, Notice, inputClass } from '../ui';

function dueLabel(nextDueAt: string | null, daysOnline: number | null): string {
  const online = daysOnline != null ? ` Seit ${daysOnline} Tagen online.` : '';
  if (!nextDueAt) return `Noch kein Termin.${online}`;
  const due = new Date(nextDueAt);
  if (due.getTime() <= Date.now()) return `Die nächste Senkung ist fällig.${online}`;
  const when = due.toLocaleString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `Nächste Senkung frühestens am ${when}.${online}`;
}

const STATUS = [
  { id: 'INHERIT', label: 'Vorgabe' },
  { id: 'ACTIVE', label: 'An' },
  { id: 'PAUSED', label: 'Pause' },
  { id: 'STOPPED', label: 'Stopp' },
] as const;

export function MarkdownPanel({ itemId, onChanged }: { itemId: string; onChanged: () => void }) {
  const toast = useToast();
  const [plan, setPlan] = useState<ItemMarkdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    markdownApi
      .forItem(itemId)
      .then(setPlan)
      .catch((caught) => {
        setError(caught instanceof ApiRequestError ? caught.body.message : 'Die Preissenkung ist gerade nicht erreichbar.');
      });
  }, [itemId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !plan) return <Notice tone="danger">{error}</Notice>;
  if (!plan) return null;

  const save = async (next: {
    status: ItemMarkdown['status'];
    percent: number | null;
    intervalDays: number | null;
    floorPrice: number | null;
  }) => {
    setBusy(true);
    setError(null);
    try {
      setPlan(await markdownApi.savePlan(itemId, next));
      toast('Preissenkung gespeichert', 'success');
      onChanged();
    } catch (caught) {
      const message = caught instanceof ApiRequestError ? caught.body.message : 'Speichern hat nicht geklappt.';
      setError(message);
      toast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-surface border border-line rounded-card shadow-card p-4 space-y-3" aria-label="Preissenkung">
      <h2 className="text-micro uppercase text-ink-muted">Preissenkung</h2>
      <p className="text-body text-ink">{plan.effective.summary}</p>
      {plan.effective.lastError && <Notice tone="danger">{plan.effective.lastError}</Notice>}
      {plan.effective.running && !plan.effective.waitingForConfirm && (
        <p className="text-label font-normal text-ink-faint">{dueLabel(plan.effective.nextDueAt, plan.effective.daysOnline)}</p>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <PlanForm key={`${plan.status}-${plan.floorPrice}-${plan.percent}-${plan.intervalDays}`} plan={plan} busy={busy} onSave={save} />
      <MarkdownTaskList
        tasks={plan.tasks}
        onDone={(result) => {
          toast(result.message, result.applied ? 'success' : 'error');
          load();
          onChanged();
        }}
      />
      {plan.history.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-micro uppercase text-ink-muted">Preisverlauf</h3>
          <ul className="space-y-1">
            {plan.history.map((entry) => (
              <li key={entry.id} className="text-label font-normal text-ink">
                {entry.note} Vorher {formatEuro(entry.previousPrice)}, danach {formatEuro(entry.newPrice)}.
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function PlanForm({
  plan,
  busy,
  onSave,
}: {
  plan: ItemMarkdown;
  busy: boolean;
  onSave: (next: {
    status: ItemMarkdown['status'];
    percent: number | null;
    intervalDays: number | null;
    floorPrice: number | null;
  }) => Promise<void>;
}) {
  const [status, setStatus] = useState(plan.status);
  const [percent, setPercent] = useState(String(plan.percent ?? plan.effective.percent));
  const [intervalDays, setIntervalDays] = useState(String(plan.intervalDays ?? plan.effective.intervalDays));
  const [floor, setFloor] = useState(plan.floorPrice != null ? String(plan.floorPrice) : '');

  const parsedPercent = Number(percent.replace(',', '.'));
  const parsedDays = Number(intervalDays);
  const parsedFloor = floor.trim() === '' ? null : Number(floor.replace(',', '.'));
  const floorOk = parsedFloor == null || (Number.isFinite(parsedFloor) && parsedFloor > 0);
  const customOk =
    status !== 'ACTIVE' ||
    (Number.isFinite(parsedPercent) && parsedPercent >= 1 && parsedPercent <= 90 && Number.isInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 90);

  return (
    <div className="space-y-3">
      <div className="flex gap-2" role="tablist" aria-label="Preissenkung für diesen Artikel">
        {STATUS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={status === entry.id}
            onClick={() => setStatus(entry.id)}
            className={`flex-1 h-9 rounded-control text-label border transition-colors ${
              status === entry.id
                ? 'bg-accent text-accent-ink border-accent'
                : 'bg-surface-hover text-ink-muted border-line hover:border-accent hover:text-accent'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {status === 'ACTIVE' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Prozent">
            <input value={percent} onChange={(event) => setPercent(event.target.value)} inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Alle … Tage">
            <input value={intervalDays} onChange={(event) => setIntervalDays(event.target.value)} inputMode="numeric" className={inputClass} />
          </Field>
        </div>
      )}
      <Field
        label="Mindestpreis"
        hint={
          plan.effective.suggestionFloor != null
            ? `Leer lassen heißt ${formatEuro(plan.effective.suggestionFloor)} aus dem Preisvorschlag.`
            : 'Ohne eigenen Preis und ohne Preisvorschlag senkt die App nichts.'
        }
      >
        <input
          value={floor}
          onChange={(event) => setFloor(event.target.value)}
          inputMode="decimal"
          placeholder={plan.effective.suggestionFloor != null ? String(plan.effective.suggestionFloor) : ''}
          className={`${inputClass} tabular-nums`}
        />
      </Field>
      {!floorOk && <Notice tone="danger">Der Mindestpreis muss über 0 € liegen.</Notice>}
      <Button
        size="sm"
        loading={busy}
        disabled={busy || !floorOk || !customOk}
        onClick={() =>
          void onSave({
            status,
            percent: status === 'ACTIVE' ? parsedPercent : null,
            intervalDays: status === 'ACTIVE' ? parsedDays : null,
            floorPrice: parsedFloor,
          })
        }
      >
        Speichern
      </Button>
    </div>
  );
}

export function MarkdownSettingsCard() {
  const toast = useToast();
  const [settings, setSettings] = useState<MarkdownSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    markdownApi
      .settings()
      .then(setSettings)
      .catch(() => setError('Die Vorgabe ist gerade nicht erreichbar.'));
  }, []);

  if (error && !settings) return <Notice tone="danger">{error}</Notice>;
  if (!settings) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      setSettings(await markdownApi.saveSettings(settings));
      toast('Vorgabe gespeichert', 'success');
    } catch (caught) {
      const message = caught instanceof ApiRequestError ? caught.body.message : 'Speichern hat nicht geklappt.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-surface border border-line rounded-card shadow-card p-4 space-y-3" aria-label="Automatische Preissenkung">
      <h2 className="text-title text-ink">Automatische Preissenkung</h2>
      <p className="text-label font-normal text-ink-muted">
        Optional und aus, bis du sie einschaltest. eBay wird über die Sell API geändert. Kleinanzeigen und Vinted
        bekommen eine Aufgabe. Unter den Mindestpreis geht nichts, ein verkaufter Artikel auch nicht.
      </p>
      <label className="flex items-center justify-between gap-3">
        <span className="text-body text-ink">Für alle Artikel</span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
          className="h-5 w-5 accent-accent"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Prozent">
          <input
            value={String(settings.percent)}
            onChange={(event) => setSettings({ ...settings, percent: Number(event.target.value.replace(',', '.')) })}
            inputMode="decimal"
            className={inputClass}
          />
        </Field>
        <Field label="Alle … Tage">
          <input
            value={String(settings.intervalDays)}
            onChange={(event) => setSettings({ ...settings, intervalDays: Number(event.target.value) })}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Wiedervorlage nach Tagen">
        <input
          value={String(settings.attentionAfterDays)}
          onChange={(event) => setSettings({ ...settings, attentionAfterDays: Number(event.target.value) })}
          inputMode="numeric"
          className={inputClass}
        />
      </Field>
      <p className="text-label font-normal text-ink-faint">
        Geprüft wird etwa stündlich. Der Mindestpreis steht am Artikel. Fehlt er, kommt er aus dem Preisvorschlag.
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button size="sm" loading={busy} disabled={busy} onClick={() => void save()}>
        Vorgabe speichern
      </Button>
    </section>
  );
}
