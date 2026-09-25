import { createActor } from 'xstate';
import { itemMachine } from './item.machine';

const user = { type: 'USER' as const };
const system = { type: 'SYSTEM' as const };
const webhook = { type: 'WEBHOOK' as const };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transition(fromState: string, event: any) {
  const resolved = itemMachine.resolveState({ value: fromState, context: {} });
  const actor = createActor(itemMachine, { snapshot: resolved });
  actor.start();
  actor.send(event);
  const value = actor.getSnapshot().value;
  actor.stop();
  return value;
}

describe('itemMachine', () => {
  it('walks the full happy path NEW -> ... -> ARCHIVED', () => {
    expect(transition('NEW', { type: 'UPLOAD_PHOTO', actor: system })).toBe('ANALYZING');
    expect(transition('ANALYZING', { type: 'AI_ANALYSIS_COMPLETE', actor: system })).toBe(
      'REVIEW_REQUIRED',
    );
    expect(transition('REVIEW_REQUIRED', { type: 'CONFIRM_TRUTH', actor: user })).toBe('READY');
    expect(transition('READY', { type: 'START_LISTING', actor: user })).toBe('LISTED');
    expect(transition('LISTED', { type: 'SALE_CONFIRMED_SINGLE', actor: system })).toBe('SOLD');
    expect(transition('SOLD', { type: 'ARCHIVE', actor: system })).toBe('ARCHIVED');
  });

  it('rejects state-jumping (e.g. REVIEW_REQUIRED -> BUNDLED directly)', () => {
    expect(transition('REVIEW_REQUIRED', { type: 'ASSIGN_TO_BUNDLE', actor: user })).toBe(
      'REVIEW_REQUIRED',
    );
  });

  it('rejects DRAFT-style skip: READY -> SOLD directly', () => {
    expect(transition('READY', { type: 'SALE_CONFIRMED_SINGLE', actor: user })).toBe('READY');
  });

  it('blocks CONFIRM_TRUTH for a non-USER actor (human-gate guard)', () => {
    expect(transition('REVIEW_REQUIRED', { type: 'CONFIRM_TRUTH', actor: system })).toBe(
      'REVIEW_REQUIRED',
    );
    expect(transition('REVIEW_REQUIRED', { type: 'CONFIRM_TRUTH', actor: webhook })).toBe(
      'REVIEW_REQUIRED',
    );
  });

  it('never lets SALE_CONFLICT -> SOLD happen for a non-USER actor (Invariante I2)', () => {
    expect(transition('SALE_CONFLICT', { type: 'RESOLVE_CONFLICT_SOLD', actor: webhook })).toBe(
      'SALE_CONFLICT',
    );
    expect(transition('SALE_CONFLICT', { type: 'RESOLVE_CONFLICT_SOLD', actor: system })).toBe(
      'SALE_CONFLICT',
    );
    expect(transition('SALE_CONFLICT', { type: 'RESOLVE_CONFLICT_SOLD', actor: user })).toBe(
      'SOLD',
    );
  });

  it('allows LISTED -> SALE_CONFLICT for any actor (deterministic, no gate)', () => {
    expect(transition('LISTED', { type: 'SALE_CONFLICT_DETECTED', actor: webhook })).toBe(
      'SALE_CONFLICT',
    );
  });

  it('locks BUNDLED as terminal within the item machine (no outgoing events)', () => {
    expect(transition('BUNDLED', { type: 'START_LISTING', actor: user })).toBe('BUNDLED');
  });

  it('allows discarding a mistaken/duplicate item before it is listed', () => {
    expect(transition('NEW', { type: 'DISCARD', actor: user })).toBe('CANCELLED');
    expect(transition('ANALYZING', { type: 'DISCARD', actor: user })).toBe('CANCELLED');
    expect(transition('REVIEW_REQUIRED', { type: 'DISCARD', actor: user })).toBe('CANCELLED');
    expect(transition('READY', { type: 'DISCARD', actor: user })).toBe('CANCELLED');
  });

  it('blocks DISCARD for a non-USER actor (human-gate guard)', () => {
    expect(transition('READY', { type: 'DISCARD', actor: system })).toBe('READY');
  });

  it('does not allow DISCARD once an item is LISTED (must go through conflict/sale resolution instead)', () => {
    expect(transition('LISTED', { type: 'DISCARD', actor: user })).toBe('LISTED');
  });
});
