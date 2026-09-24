import { Injectable } from '@nestjs/common';
import {
  ImageOptimizationProvider,
  OptimizeImageInput,
  OptimizeImageResult,
} from '../../domain/ai/image-optimization-provider.interface';

/**
 * Platzhalter für die echte Nano-Banana-Anbindung (siehe
 * RealImageOptimizationProvider) — gebunden, solange kein echter
 * GEMINI_API_KEY konfiguriert ist. Reicht das Originalbild unverändert
 * durch, statt ein "optimiertes" Bild vorzutäuschen, das keins ist.
 */
@Injectable()
export class MockImageOptimizationProvider implements ImageOptimizationProvider {
  async optimize(input: OptimizeImageInput): Promise<OptimizeImageResult | null> {
    return { buffer: input.buffer, mimeType: input.mimeType };
  }
}
