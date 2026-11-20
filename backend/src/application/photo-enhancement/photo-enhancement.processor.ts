import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PHOTO_ENHANCEMENT_QUEUE } from '../../infrastructure/queue/queue-names';
import { PhotoEnhancementService } from './photo-enhancement.service';

/**
 * BullMQ setzt `attemptsMade` vor dem Aufruf hoch. Der letzte Versuch
 * schreibt „fehlgeschlagen“, frühere Versuche lassen das Foto auf
 * „wird verbessert“ und werfen weiter, damit BullMQ neu ansetzt.
 */
@Processor(PHOTO_ENHANCEMENT_QUEUE)
export class PhotoEnhancementProcessor extends WorkerHost {
  private readonly logger = new Logger(PhotoEnhancementProcessor.name);

  constructor(private readonly enhancement: PhotoEnhancementService) {
    super();
  }

  async process(job: Job<{ photoId: string }>): Promise<void> {
    const photoId = job.data.photoId;
    try {
      await this.enhancement.enhancePhoto(photoId);
    } catch (error) {
      const attempts = job.opts.attempts ?? 1;
      const made = job.attemptsMade ?? 0;
      if (made >= attempts) {
        await this.enhancement.markFailed(photoId);
        this.logger.warn(`Foto-Verbesserung fehlgeschlagen für ${photoId}: ${(error as Error).message}`);
      } else {
        await this.enhancement.markRetry(photoId);
      }
      throw error;
    }
  }
}
