import { conditionAdjustment } from './condition-adjustment';

describe('conditionAdjustment', () => {
  it('treats the German label and the stored English value as the same condition', () => {
    expect(conditionAdjustment('Gut')).toEqual(conditionAdjustment('good'));
    expect(conditionAdjustment('Wie neu').factor).toBeGreaterThan(1);
    expect(conditionAdjustment('Gebraucht').factor).toBeLessThan(1);
    expect(conditionAdjustment('Defekt').factor).toBeLessThan(conditionAdjustment('Gebraucht').factor);
  });

  it('does not invent an adjustment when the condition is missing', () => {
    expect(conditionAdjustment(null)).toMatchObject({ factor: 1, key: null });
    expect(conditionAdjustment('unbekannt').factor).toBe(1);
  });
});