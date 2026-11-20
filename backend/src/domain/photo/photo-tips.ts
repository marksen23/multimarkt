import { CaptureMetrics, PhotoTip, PhotoTipCode } from './photo-enhancement.types';

// Dieselben Schwellen wie der Foto-Check: ein Hinweis soll hier und dort
// dasselbe Foto meinen. Die Sätze sind für ein Handy gedacht, ohne Stativ.
const SHARPNESS_MIN_VARIANCE = 50;
const BRIGHTNESS_TOO_DARK = 40;

const TIP_TEXT: Record<PhotoTipCode, string> = {
  BLURRY:
    'Das Foto ist unscharf. Halt das Handy ruhig, tippe auf den Artikel und warte, bis er scharf ist.',
  TOO_DARK:
    'Das Foto ist zu dunkel. Geh näher ans Fenster oder mach eine Lampe an. Der Blitz wirft harte Schatten.',
  CUT_OFF:
    'Der Artikel ist angeschnitten. Geh einen Schritt zurück, bis er komplett im Bild ist, mit etwas Luft am Rand.',
};

export function heuristicTips(metrics: CaptureMetrics): PhotoTip[] {
  const codes: PhotoTipCode[] = [];
  if (metrics.sharpness < SHARPNESS_MIN_VARIANCE) codes.push('BLURRY');
  if (metrics.brightness < BRIGHTNESS_TOO_DARK) codes.push('TOO_DARK');
  if (metrics.cutOff) codes.push('CUT_OFF');
  return codes.map((code) => ({ code, message: TIP_TEXT[code], source: 'pixel' }));
}

export function coverScore(metrics: CaptureMetrics): number {
  const sharp = clamp(metrics.sharpness / 200, 0, 1);
  const exposure =
    metrics.brightness < BRIGHTNESS_TOO_DARK || metrics.brightness > 215
      ? 0.2
      : 1 - Math.abs(metrics.brightness - 128) / 128;
  const fill = metrics.subjectFill >= 0.2 && metrics.subjectFill <= 0.85 ? 1 : 0.45;
  const complete = metrics.cutOff ? 0 : 1;
  return sharp * 0.45 + exposure * 0.2 + fill * 0.15 + complete * 0.2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
