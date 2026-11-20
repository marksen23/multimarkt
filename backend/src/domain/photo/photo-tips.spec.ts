import { coverScore, heuristicTips } from './photo-tips';
import { CaptureMetrics } from './photo-enhancement.types';

const clear: CaptureMetrics = { sharpness: 180, brightness: 130, cutOff: false, subjectFill: 0.45 };

describe('heuristicTips', () => {
  it('stays quiet when the phone photo is already usable', () => {
    expect(heuristicTips(clear)).toEqual([]);
  });

  it('names blur, darkness and a cut-off subject in German', () => {
    const tips = heuristicTips({ sharpness: 4, brightness: 20, cutOff: true, subjectFill: 0.9 });
    expect(tips.map((tip) => tip.code)).toEqual(['BLURRY', 'TOO_DARK', 'CUT_OFF']);
    expect(tips.every((tip) => tip.source === 'pixel' && /Foto|Artikel/.test(tip.message))).toBe(true);
  });
});

describe('coverScore', () => {
  it('ranks a sharp, complete photo above a dark, cut-off one', () => {
    const weak = coverScore({ sharpness: 8, brightness: 18, cutOff: true, subjectFill: 0.98 });
    expect(coverScore(clear)).toBeGreaterThan(weak);
  });
});
