import { PhotoTipCode } from '../photo/photo-enhancement.types';

export interface PhotoTipRequest {
  buffer: Buffer;
  mimeType: string;
  issues: PhotoTipCode[];
}

/**
 * Kurzer deutscher Fototipp. `available` ist false, solange kein echter
 * Gemini-Schlüssel gesetzt ist — dann bleibt der Pixel-Hinweis stehen.
 * Es gibt keinen stillen Beispielsatz.
 */
export interface PhotoTipProvider {
  readonly available: boolean;
  advise(input: PhotoTipRequest): Promise<string | null>;
}

export const PHOTO_TIP_PROVIDER = Symbol('PHOTO_TIP_PROVIDER');
