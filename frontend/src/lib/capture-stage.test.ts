import { describe, expect, it } from 'vitest';
import { captureStatusText, captureStepState } from './capture-stage';

describe('captureStepState', () => {
  it('marks earlier steps done and the active step current', () => {
    expect(captureStepState('uploading', 'creating')).toBe('done');
    expect(captureStepState('uploading', 'uploading')).toBe('current');
    expect(captureStepState('uploading', 'analyzing')).toBe('pending');
  });

  it('keeps the analysis step current until the request finishes', () => {
    expect(captureStepState('analyzing', 'creating')).toBe('done');
    expect(captureStepState('analyzing', 'uploading')).toBe('done');
    expect(captureStepState('analyzing', 'analyzing')).toBe('current');
  });
});

describe('captureStatusText', () => {
  it('names the stage in German without a stuck 100 percent during analysis', () => {
    expect(captureStatusText('creating', 0)).toBe('Artikel wird angelegt.');
    expect(captureStatusText('uploading', 40)).toContain('40');
    expect(captureStatusText('analyzing', 100)).toContain('unter einer Minute');
    expect(captureStatusText('analyzing', 100)).not.toContain('100');
  });
});
