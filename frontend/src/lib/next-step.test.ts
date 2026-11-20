import { describe, expect, it } from 'vitest';
import { nextStepHint } from './next-step';

describe('nextStepHint', () => {
  it('points at the next seller action and stays quiet when the item is finished', () => {
    expect(nextStepHint('REVIEW_REQUIRED')).toContain('unsichere Angaben');
    expect(nextStepHint('READY')).toContain('Abholung oder Versand');
    expect(nextStepHint('SOLD')).toBeNull();
    expect(nextStepHint('ARCHIVED')).toBeNull();
  });
});
