import { classifyVisionClaim, keepUserConfirmed } from './product-analysis.service';

describe('classifyVisionClaim', () => {
  it('keeps a confident claim inferred instead of confirming it', () => {
    expect(classifyVisionClaim({ key: 'brand', value: 'Nike', confidence: 0.99 }).truthState).toBe('INFERRED');
    expect(classifyVisionClaim({ key: 'category', value: null, confidence: 0 }).truthState).toBe('UNKNOWN');
  });

  it('lets a re-analysis replace an auto-confirmed value and keeps a human confirmation', () => {
    expect(keepUserConfirmed({ truthState: 'USER_CONFIRMED', source: 'mock-gemini-vision-stub-v1:auto' })).toBe(
      false,
    );
    expect(keepUserConfirmed({ truthState: 'USER_CONFIRMED', source: 'USER_INPUT' })).toBe(true);
    expect(keepUserConfirmed({ truthState: 'INFERRED', source: 'gemini-flash-latest' })).toBe(false);
    expect(keepUserConfirmed(null)).toBe(false);
  });
});
