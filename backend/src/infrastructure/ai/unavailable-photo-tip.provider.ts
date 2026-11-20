import { Injectable } from '@nestjs/common';
import { PhotoTipProvider, PhotoTipRequest } from '../../domain/ai/photo-tip-provider.interface';

/** Kein Gemini-Schlüssel: der Aufrufer behält den Hinweis aus der Pixelprüfung. */
@Injectable()
export class UnavailablePhotoTipProvider implements PhotoTipProvider {
  readonly available = false;

  async advise(_input: PhotoTipRequest): Promise<string | null> {
    return null;
  }
}
