import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { markdownApi, type MarkdownTask, type TaskActionResult } from '../api/markdown';
import { ApiRequestError } from '../api/client';
import { copyText } from '../lib/clipboard';
import { formatEuro } from '../lib/format';
import { Button, Notice } from '../ui';

export function MarkdownTaskList({
  tasks,
  onDone,
}: {
  tasks: MarkdownTask[];
  onDone: (result: TaskActionResult) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <MarkdownTaskRow key={task.id} task={task} onDone={onDone} />
      ))}
    </ul>
  );
}

function MarkdownTaskRow({
  task,
  onDone,
}: {
  task: MarkdownTask;
  onDone: (result: TaskActionResult) => void;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      await copyText(task.copyText);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    timer.current = setTimeout(() => setCopyState('idle'), 1800);
  };

  const run = async (action: 'confirm' | 'dismiss') => {
    setBusy(true);
    setError(null);
    try {
      const result = action === 'confirm' ? await markdownApi.confirmTask(task.id) : await markdownApi.dismissTask(task.id);
      onDone(result);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.body.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-control border border-line bg-surface-hover/40 p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">{task.message}</p>
          <p className="text-label font-normal text-ink-muted">
            {task.marketplaceLabel}
            {task.itemTitle ? ` · ${task.itemTitle}` : ''}
            {task.kind === 'MANUAL_PRICE' ? ` · jetzt ${formatEuro(task.previousPrice)}` : ''}
          </p>
        </div>
        {task.itemId && (
          <Link to={`/items/${task.itemId}`} className="text-label text-accent shrink-0">
            Artikel
          </Link>
        )}
      </div>
      {task.detail && <p className="text-label font-normal text-ink-muted">{task.detail}</p>}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={copyState === 'copied' ? 'check' : 'copy'} onClick={() => void copy()}>
          {copyState === 'copied' ? 'Preis kopiert' : copyState === 'error' ? 'Kopieren nicht möglich' : 'Preis kopieren'}
        </Button>
        {task.kind === 'MANUAL_PRICE' ? (
          <Button size="sm" loading={busy} disabled={busy} onClick={() => void run('confirm')}>
            Preis gesenkt
          </Button>
        ) : (
          <Button size="sm" variant="secondary" loading={busy} disabled={busy} onClick={() => void run('dismiss')}>
            Verstanden
          </Button>
        )}
      </div>
    </li>
  );
}
