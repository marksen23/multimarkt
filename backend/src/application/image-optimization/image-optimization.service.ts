import { Inject, Injectable } from '@nestjs/common';
import {
  IMAGE_OPTIMIZATION_PROVIDER,
  ImageOptimizationProvider,
} from '../../domain/ai/image-optimization-provider.interface';
import { STORAGE_PROVIDER, StorageProvider } from '../../domain/storage/storage-provider.interface';

export interface OptimizedPhoto {
  url: string;
}

/**
 * Orchestriert Bildoptimierung + Speicherung (docs/README.md
 * §9e-Ergänzung). Das Ergebnis landet als NEUE, zusätzliche Datei —
 * ersetzt nie das Original (der Aufrufer/Frontend zeigt beides zur Wahl).
 */
@Injectable()
export class ImageOptimizationService {
  constructor(
    @Inject(IMAGE_OPTIMIZATION_PROVIDER) private readonly provider: ImageOptimizationProvider,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async optimize(input: {
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }): Promise<OptimizedPhoto | null> {
    const result = await this.provider.optimize({ buffer: input.buffer, mimeType: input.mimeType });
    if (!result) return null;

    const stored = await this.storage.upload({
      buffer: result.buffer,
      mimeType: result.mimeType,
      originalName: `optimized-${input.originalName}`,
    });
    return { url: stored.url };
  }
}
