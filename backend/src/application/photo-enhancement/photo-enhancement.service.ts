import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, In } from 'typeorm';
import { PHOTO_TIP_PROVIDER, PhotoTipProvider } from '../../domain/ai/photo-tip-provider.interface';
import { enhanceListingPhoto } from '../../domain/photo/enhance-photo';
import { PhotoTip } from '../../domain/photo/photo-enhancement.types';
import { coverScore, heuristicTips } from '../../domain/photo/photo-tips';
import { comparePhotoOrder } from '../../domain/photo/publishable-photo';
import { STORAGE_PROVIDER, StorageProvider } from '../../domain/storage/storage-provider.interface';
import { ItemPhotoEntity } from '../../infrastructure/database/entities';
import { PHOTO_ENHANCEMENT_QUEUE } from '../../infrastructure/queue/queue-names';

const FAILED_MESSAGE = 'Die Verbesserung ist fehlgeschlagen. Das Original bleibt erhalten.';

/**
 * Legt die Verbesserung in BullMQ ab und schreibt das Ergebnis als zweite
 * Datei. Der Upload selbst wartet nicht auf sharp oder Gemini.
 */
@Injectable()
export class PhotoEnhancementService {
  private readonly logger = new Logger(PhotoEnhancementService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @InjectQueue(PHOTO_ENHANCEMENT_QUEUE) private readonly queue: Queue,
    @Inject(PHOTO_TIP_PROVIDER) private readonly tips: PhotoTipProvider,
    private readonly config: ConfigService,
  ) {}

  async enqueue(photoIds: string[]): Promise<void> {
    if (photoIds.length === 0) return;
    if (!this.enhancementEnabled()) {
      await this.dataSource.manager.update(
        ItemPhotoEntity,
        { id: In(photoIds) },
        { enhancementStatus: 'skipped' },
      );
      return;
    }
    for (const photoId of photoIds) {
      await this.enqueueOne(photoId);
    }
  }

  async enhancePhoto(photoId: string): Promise<void> {
    const photo = await this.dataSource.manager.findOneBy(ItemPhotoEntity, { id: photoId });
    if (!photo) return;
    if (!this.enhancementEnabled()) {
      photo.enhancementStatus = 'skipped';
      await this.dataSource.manager.save(photo);
      return;
    }

    photo.enhancementStatus = 'processing';
    photo.enhancementError = null;
    await this.dataSource.manager.save(photo);

    const original = await this.storage.read(photo.storageKey);
    const siblings = await this.photosForItem(photo.itemId);
    const isCover = siblings[0]?.id === photo.id;
    const result = await enhanceListingPhoto(original, {
      whiteBackground: isCover && this.whiteBackgroundEnabled(),
    });
    const stored = await this.storage.upload({
      buffer: result.buffer,
      mimeType: result.mimeType,
      originalName: `enhanced-${photo.id}.jpg`,
    });
    const previousKey = photo.enhancedStorageKey;
    const tips = await this.tipsFor(original, photo.storageKey, result.capture);

    photo.enhancedUrl = stored.url;
    photo.enhancedStorageKey = stored.key;
    photo.enhancementStatus = 'ready';
    photo.enhancementError = null;
    photo.tips = tips;
    photo.coverScore = coverScore(result.capture);
    await this.dataSource.manager.save(photo);

    if (previousKey && previousKey !== stored.key) {
      try {
        await this.storage.delete(previousKey);
      } catch (error) {
        this.logger.warn(`Alte verbesserte Datei bleibt liegen: ${(error as Error).message}`);
      }
    }
    await this.refreshCoverSuggestion(photo.itemId);
  }

  async markFailed(photoId: string): Promise<void> {
    await this.dataSource.manager.update(
      ItemPhotoEntity,
      { id: photoId },
      { enhancementStatus: 'failed', enhancementError: FAILED_MESSAGE },
    );
  }

  async markRetry(photoId: string): Promise<void> {
    await this.dataSource.manager.update(
      ItemPhotoEntity,
      { id: photoId },
      { enhancementStatus: 'pending', enhancementError: null },
    );
  }

  async makeCover(itemId: string, photoId: string): Promise<ItemPhotoEntity[]> {
    const photos = await this.photosForItem(itemId);
    const chosen = photos.find((photo) => photo.id === photoId);
    if (!chosen) throw new NotFoundException(`Photo ${photoId} not found`);
    if (photos[0]?.id === photoId) return photos;

    const previousCoverId = photos[0].id;
    const ordered = [chosen, ...photos.filter((photo) => photo.id !== photoId)];
    for (let index = 0; index < ordered.length; index += 1) {
      ordered[index].sortOrder = index;
      ordered[index].suggestedCover = false;
      if (ordered[index].id === photoId || ordered[index].id === previousCoverId) {
        ordered[index].enhancementStatus = 'pending';
        ordered[index].enhancementError = null;
      }
    }
    await this.dataSource.manager.save(ItemPhotoEntity, ordered);
    await this.enqueue([photoId, previousCoverId]);
    return ordered;
  }

  private async tipsFor(
    original: Buffer,
    storageKey: string,
    capture: Parameters<typeof heuristicTips>[0],
  ): Promise<PhotoTip[]> {
    const pixel = heuristicTips(capture);
    if (pixel.length === 0 || !this.tips.available) return pixel;
    try {
      const text = await this.tips.advise({
        buffer: original,
        mimeType: mimeFromKey(storageKey),
        issues: pixel.map((tip) => tip.code),
      });
      if (!text) return pixel;
      return pixel.map((tip) => ({ ...tip, message: text, source: 'gemini' as const }));
    } catch (error) {
      this.logger.warn(`Foto-Tipp ausgelassen: ${(error as Error).message}`);
      return pixel;
    }
  }

  private async refreshCoverSuggestion(itemId: string): Promise<void> {
    const photos = await this.photosForItem(itemId);
    const ranked = photos.filter((photo) => photo.enhancementStatus === 'ready' && photo.coverScore != null);
    let suggestedId: string | null = null;
    if (ranked.length >= 2 && photos[0]) {
      const best = ranked
        .slice()
        .sort((a, b) => (b.coverScore ?? 0) - (a.coverScore ?? 0) || a.sortOrder - b.sortOrder)[0];
      const cover = photos[0];
      if (best.id !== cover.id && (best.coverScore ?? 0) > (cover.coverScore ?? 0) + 0.05) {
        suggestedId = best.id;
      }
    }
    for (const photo of photos) {
      const suggested = photo.id === suggestedId;
      if (photo.suggestedCover !== suggested) {
        await this.dataSource.manager.update(ItemPhotoEntity, { id: photo.id }, { suggestedCover: suggested });
      }
    }
  }

  private async photosForItem(itemId: string): Promise<ItemPhotoEntity[]> {
    const photos = await this.dataSource.manager.find(ItemPhotoEntity, { where: { itemId } });
    photos.sort(comparePhotoOrder);
    return photos;
  }

  private async enqueueOne(photoId: string): Promise<void> {
    const jobId = `photo-enhance-${photoId}`;
    try {
      const existing = await this.queue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === 'active') {
          await this.queue.add(
            'enhance',
            { photoId },
            {
              delay: 4_000,
              jobId: `${jobId}-follow-${Date.now()}`,
              attempts: 3,
              backoff: { type: 'exponential', delay: 2_000 },
              removeOnComplete: true,
              removeOnFail: 50,
            },
          );
          return;
        }
        await existing.remove();
      }
      await this.queue.add(
        'enhance',
        { photoId },
        {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );
    } catch (error) {
      this.logger.error(`Foto ${photoId} konnte nicht eingeplant werden: ${(error as Error).message}`);
      await this.markFailed(photoId);
    }
  }

  private enhancementEnabled(): boolean {
    return !isOff(this.config.get<string>('PHOTO_ENHANCEMENT_ENABLED'));
  }

  private whiteBackgroundEnabled(): boolean {
    return !isOff(this.config.get<string>('PHOTO_COVER_WHITE_BACKGROUND'));
  }
}

function isOff(raw: string | undefined): boolean {
  if (raw == null || raw === '') return false;
  return ['0', 'false', 'off', 'no'].includes(raw.toLowerCase());
}

function mimeFromKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
}
