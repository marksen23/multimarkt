export const ENHANCEMENT_STATUSES = ['pending', 'processing', 'ready', 'failed', 'skipped'] as const;

export type EnhancementStatus = (typeof ENHANCEMENT_STATUSES)[number];

export const PHOTO_TIP_CODES = ['BLURRY', 'TOO_DARK', 'CUT_OFF'] as const;

export type PhotoTipCode = (typeof PHOTO_TIP_CODES)[number];

export interface PhotoTip {
  code: PhotoTipCode;
  message: string;
  source: 'pixel' | 'gemini';
}

export interface CaptureMetrics {
  sharpness: number;
  brightness: number;
  cutOff: boolean;
  subjectFill: number;
}

export interface EnhancementResult {
  buffer: Buffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  capture: CaptureMetrics;
  backgroundCleaned: boolean;
}
