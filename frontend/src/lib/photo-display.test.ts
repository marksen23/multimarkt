import { describe, expect, it } from 'vitest';
import { enhancementProgress, photoTipLines, publishVersionHint, shownPhotoUrl, showingEnhanced } from './photo-display';

const ready = {
  url: '/uploads/original.jpg',
  enhancedUrl: '/uploads/enhanced.jpg',
  displayUrl: '/uploads/enhanced.jpg',
  enhancementStatus: 'ready' as const,
  preferEnhanced: true,
};

describe('shownPhotoUrl', () => {
  it('uses the server display url', () => {
    expect(shownPhotoUrl(ready)).toBe('/uploads/enhanced.jpg');
  });

  it('falls back to the original while the enhanced file is not selected', () => {
    expect(
      shownPhotoUrl({
        url: '/uploads/original.jpg',
        enhancedUrl: '/uploads/enhanced.jpg',
        enhancementStatus: 'ready',
        preferEnhanced: false,
      }),
    ).toBe('/uploads/original.jpg');
  });
});

describe('enhancementProgress', () => {
  it('describes a running batch in German and ignores skipped photos', () => {
    const progress = enhancementProgress([
      { enhancementStatus: 'ready' },
      { enhancementStatus: 'processing' },
      { enhancementStatus: 'skipped' },
    ]);
    expect(progress).toEqual({
      active: true,
      done: 1,
      total: 2,
      text: '1 von 2 Fotos verbessert …',
    });
  });

  it('stays quiet once every tracked photo is finished', () => {
    expect(enhancementProgress([{ enhancementStatus: 'ready' }, { enhancementStatus: 'failed' }]).text).toBeNull();
  });
});

describe('publishVersionHint', () => {
  it('says which version will be published', () => {
    expect(publishVersionHint([ready])).toContain('verbesserte Version');
    expect(publishVersionHint([{ ...ready, preferEnhanced: false }])).toContain('Originale');
  });
});

describe('photoTipLines', () => {
  it('shows one line when Gemini repeats the same sentence', () => {
    const lines = photoTipLines([
      {
        tips: [
          { code: 'BLURRY', message: 'Halt das Handy ruhig.', source: 'gemini' },
          { code: 'CUT_OFF', message: 'Halt das Handy ruhig.', source: 'gemini' },
        ],
      },
    ]);
    expect(lines).toEqual([{ label: 'Foto 1', message: 'Halt das Handy ruhig.' }]);
  });
});

describe('showingEnhanced', () => {
  it('is on only for a ready enhanced photo that the seller kept', () => {
    expect(showingEnhanced(ready)).toBe(true);
    expect(showingEnhanced({ ...ready, preferEnhanced: false })).toBe(false);
    expect(showingEnhanced({ ...ready, enhancementStatus: 'pending' })).toBe(false);
  });
});
