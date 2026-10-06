import {
  buildFollowUp,
  daysOnline,
  followUpCopyText,
  oneStepBelow,
  pendingFollowUpStage,
  priceLoweredNote,
  suggestFollowUpPrice,
} from './follow-up';

const day = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-06T10:00:00.000Z');

describe('follow-up deadlines', () => {
  it('counts full days since the listing went online', () => {
    expect(daysOnline(new Date(now.getTime() - 7 * day + 1), now)).toBe(6);
    expect(daysOnline(new Date(now.getTime() - 7 * day), now)).toBe(7);
    expect(daysOnline(new Date(now.getTime() - 14 * day), now)).toBe(14);
  });

  it('shows the 7-day follow-up, then the 14-day one', () => {
    expect(pendingFollowUpStage(6, [])).toBeNull();
    expect(pendingFollowUpStage(7, [])).toBe(7);
    expect(pendingFollowUpStage(14, [])).toBe(14);
    expect(pendingFollowUpStage(14, [7])).toBe(14);
    expect(pendingFollowUpStage(20, [14])).toBeNull();
    expect(pendingFollowUpStage(8, [7])).toBeNull();
  });
});

describe('suggestFollowUpPrice', () => {
  it('suggests P_target after 7 days while the price is still above it', () => {
    expect(
      suggestFollowUpPrice({ currentPrice: 40, targetPrice: 32, stage: 7 }),
    ).toEqual({
      price: 32,
      basis: 'P_TARGET',
      anchor: 'P_TARGET',
    });
  });

  it('suggests one step below P_target after 14 days', () => {
    expect(
      suggestFollowUpPrice({ currentPrice: 40, targetPrice: 32, stage: 14 }),
    ).toEqual({
      price: 27,
      basis: 'ONE_STEP_BELOW',
      anchor: 'P_TARGET',
    });
  });

  it('suggests one step below the current price when it is already at P_target', () => {
    expect(
      suggestFollowUpPrice({ currentPrice: 32, targetPrice: 32, stage: 7 }),
    ).toEqual({
      price: 27,
      basis: 'ONE_STEP_BELOW',
      anchor: 'CURRENT',
    });
  });

  it('suggests one step below the current price when P_target is missing', () => {
    expect(
      suggestFollowUpPrice({ currentPrice: 18, targetPrice: null, stage: 7 }),
    ).toEqual({
      price: 17,
      basis: 'ONE_STEP_BELOW',
      anchor: 'CURRENT',
    });
    expect(oneStepBelow(20)).toBe(15);
    expect(oneStepBelow(19.5)).toBe(18.5);
  });

  it('has no suggestion once the price cannot fall any further', () => {
    expect(
      suggestFollowUpPrice({ currentPrice: 1, targetPrice: null, stage: 14 }),
    ).toBeNull();
  });
});

describe('price drop note and copy text', () => {
  it('stores the Berlin date in the note', () => {
    expect(priceLoweredNote(now)).toBe('Preis am 6.10.2026 gesenkt');
    expect(priceLoweredNote(new Date('2026-10-06T22:30:00.000Z'))).toBe(
      'Preis am 7.10.2026 gesenkt',
    );
  });

  it('builds a new text for copying and leaves the source description intact', () => {
    const description = 'Blaue Jacke, Größe M.';
    const copy = followUpCopyText(description, 32);
    expect(copy).toBe('Blaue Jacke, Größe M.\n\nPreis: 32.00 €.');
    expect(description).toBe('Blaue Jacke, Größe M.');
    expect(copy).not.toBe(description);
  });

  it('builds a 7-day card at P_target and a 14-day card one step below', () => {
    const week = buildFollowUp({
      currentPrice: 40,
      descriptionText: 'Jacke',
      targetPrice: 32,
      onlineSince: new Date(now.getTime() - 8 * day),
      recordedStages: [],
      now,
    });
    const fortnight = buildFollowUp({
      currentPrice: 40,
      descriptionText: 'Jacke',
      targetPrice: 32,
      onlineSince: new Date(now.getTime() - 16 * day),
      recordedStages: [],
      now,
    });

    expect(week).toMatchObject({
      stage: 7,
      suggestedPrice: 32,
      suggestionBasis: 'P_TARGET',
      copyText: 'Jacke\n\nPreis: 32.00 €.',
    });
    expect(fortnight).toMatchObject({
      stage: 14,
      suggestedPrice: 27,
      suggestionBasis: 'ONE_STEP_BELOW',
      suggestionAnchor: 'P_TARGET',
    });
    expect(
      buildFollowUp({
        currentPrice: 27,
        descriptionText: 'Jacke',
        targetPrice: 32,
        onlineSince: new Date(now.getTime() - 16 * day),
        recordedStages: [14],
        now,
      }),
    ).toBeNull();
  });
});
