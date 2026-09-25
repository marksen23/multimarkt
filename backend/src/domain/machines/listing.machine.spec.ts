import { createActor } from 'xstate';
import { listingMachine } from './listing.machine';

const user = { type: 'USER' as const };
const system = { type: 'SYSTEM' as const };
const webhook = { type: 'WEBHOOK' as const };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transition(fromState: string, event: any) {
  const resolved = listingMachine.resolveState({ value: fromState, context: {} });
  const actor = createActor(listingMachine, { snapshot: resolved });
  actor.start();
  actor.send(event);
  const value = actor.getSnapshot().value;
  actor.stop();
  return value;
}

describe('listingMachine', () => {
  it('walks the full happy path DRAFT -> ... -> SOLD', () => {
    expect(transition('DRAFT', { type: 'MARK_READY', actor: system })).toBe('READY');
    expect(transition('READY', { type: 'PUBLISH', actor: user })).toBe('PUBLISHING');
    expect(transition('PUBLISHING', { type: 'PUBLISH_SUCCESS', actor: system })).toBe('ONLINE');
    expect(transition('ONLINE', { type: 'SOLD_HERE', actor: system })).toBe('SOLD');
  });

  it('blocks PUBLISH for a non-USER actor (Human-Gate, Doc 04 §9)', () => {
    expect(transition('READY', { type: 'PUBLISH', actor: system })).toBe('READY');
    expect(transition('READY', { type: 'PUBLISH', actor: webhook })).toBe('READY');
  });

  it('reverts PUBLISHING -> READY on PUBLISH_FAILED instead of leaving it stuck (bug fix)', () => {
    expect(transition('PUBLISHING', { type: 'PUBLISH_FAILED', actor: system })).toBe('READY');
  });

  it('allows re-publishing after a reverted failure (READY is a normal, non-terminal retry point)', () => {
    const afterFailure = transition('PUBLISHING', { type: 'PUBLISH_FAILED', actor: system });
    expect(afterFailure).toBe('READY');
    expect(transition(afterFailure as string, { type: 'PUBLISH', actor: user })).toBe('PUBLISHING');
  });

  it('rejects PUBLISH_FAILED from any state other than PUBLISHING', () => {
    expect(transition('READY', { type: 'PUBLISH_FAILED', actor: system })).toBe('READY');
    expect(transition('ONLINE', { type: 'PUBLISH_FAILED', actor: system })).toBe('ONLINE');
  });

  it('CANCEL_PENDING_TRIGGERED is a deterministic side effect with no human gate', () => {
    expect(transition('ONLINE', { type: 'CANCEL_PENDING_TRIGGERED', actor: webhook })).toBe(
      'CANCEL_PENDING',
    );
  });

  it('CONFIRM_CANCELLATION accepts USER or SYSTEM but never a raw WEBHOOK actor', () => {
    expect(transition('CANCEL_PENDING', { type: 'CONFIRM_CANCELLATION', actor: webhook })).toBe(
      'CANCEL_PENDING',
    );
    expect(transition('CANCEL_PENDING', { type: 'CONFIRM_CANCELLATION', actor: system })).toBe(
      'CANCELLED',
    );
  });
});
