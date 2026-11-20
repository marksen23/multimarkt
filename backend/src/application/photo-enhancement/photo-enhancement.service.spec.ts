import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { PhotoTipProvider } from '../../domain/ai/photo-tip-provider.interface';
import { enhanceListingPhoto } from '../../domain/photo/enhance-photo';
import { ItemPhotoEntity } from '../../infrastructure/database/entities';
import { StorageProvider } from '../../domain/storage/storage-provider.interface';
import { PhotoEnhancementService } from './photo-enhancement.service';

jest.mock('../../domain/photo/enhance-photo', () => ({
  enhanceListingPhoto: jest.fn(),
}));

const enhance = enhanceListingPhoto as jest.MockedFunction<typeof enhanceListingPhoto>;

function photo(overrides: Partial<ItemPhotoEntity> = {}): ItemPhotoEntity {
  return {
    id: 'photo-1',
    itemId: 'item-1',
    url: '/uploads/original.jpg',
    storageKey: 'original.jpg',
    shot: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    enhancedUrl: null,
    enhancedStorageKey: null,
    enhancementStatus: 'pending',
    enhancementError: null,
    preferEnhanced: true,
    tips: [],
    coverScore: null,
    suggestedCover: false,
    sortOrder: 0,
    ...overrides,
  } as ItemPhotoEntity;
}

describe('PhotoEnhancementService', () => {
  const photos: ItemPhotoEntity[] = [];
  let storage: { upload: jest.Mock; read: jest.Mock; delete: jest.Mock };
  let queue: { add: jest.Mock; getJob: jest.Mock };
  let tips: PhotoTipProvider;
  let configValues: Record<string, string | undefined>;
  let dataSource: DataSource;
  let config: ConfigService;
  let service: PhotoEnhancementService;

  beforeEach(() => {
    photos.length = 0;
    enhance.mockReset();
    enhance.mockResolvedValue({
      buffer: Buffer.from('enhanced-bytes'),
      mimeType: 'image/jpeg',
      width: 80,
      height: 80,
      capture: { sharpness: 180, brightness: 130, cutOff: false, subjectFill: 0.4 },
      backgroundCleaned: false,
    });
    storage = {
      upload: jest.fn().mockResolvedValue({ url: '/uploads/enhanced.jpg', key: 'enhanced.jpg' }),
      read: jest.fn().mockResolvedValue(Buffer.from('original-bytes')),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    queue = { add: jest.fn().mockResolvedValue(undefined), getJob: jest.fn().mockResolvedValue(null) };
    tips = { available: false, advise: jest.fn() };
    configValues = {};
    const manager = {
      findOneBy: jest.fn(async (_entity: unknown, where: { id: string }) => photos.find((item) => item.id === where.id) ?? null),
      find: jest.fn(async (_entity: unknown, options: { where: { itemId: string } }) =>
        photos.filter((item) => item.itemId === options.where.itemId),
      ),
      save: jest.fn(async (_entity: unknown, value?: unknown) => value ?? _entity),
      update: jest.fn(async (_entity: unknown, where: { id: string | { value?: string[] } }, patch: Partial<ItemPhotoEntity>) => {
        const ids = typeof where.id === 'string' ? [where.id] : (where.id.value ?? []);
        for (const target of photos.filter((item) => ids.includes(item.id))) Object.assign(target, patch);
      }),
    };
    dataSource = { manager } as unknown as DataSource;
    config = { get: (key: string) => configValues[key] } as unknown as ConfigService;
    service = build();
  });

  function build(): PhotoEnhancementService {
    return new PhotoEnhancementService(
      dataSource,
      storage as unknown as StorageProvider,
      queue as unknown as Queue,
      tips,
      config,
    );
  }

  it('stores a new file and leaves the original key untouched', async () => {
    const stored = photo();
    photos.push(stored);
    await service.enhancePhoto(stored.id);

    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/jpeg', originalName: 'enhanced-photo-1.jpg' }),
    );
    expect(stored.storageKey).toBe('original.jpg');
    expect(stored.enhancedStorageKey).toBe('enhanced.jpg');
    expect(stored.enhancementStatus).toBe('ready');
    expect(stored.tips).toEqual([]);
    expect(tips.advise).not.toHaveBeenCalled();
    expect(enhance).toHaveBeenCalledWith(Buffer.from('original-bytes'), { whiteBackground: true });
  });

  it('asks Gemini only for a real problem and keeps the pixel tip when Gemini is silent', async () => {
    const stored = photo();
    photos.push(stored);
    tips = { available: true, advise: jest.fn().mockResolvedValue(null) };
    service = build();
    enhance.mockResolvedValue({
      buffer: Buffer.from('enhanced-bytes'),
      mimeType: 'image/jpeg',
      width: 80,
      height: 80,
      capture: { sharpness: 4, brightness: 18, cutOff: true, subjectFill: 0.9 },
      backgroundCleaned: false,
    });

    await service.enhancePhoto(stored.id);

    expect(tips.advise).toHaveBeenCalledWith(
      expect.objectContaining({ issues: ['BLURRY', 'TOO_DARK', 'CUT_OFF'], mimeType: 'image/jpeg' }),
    );
    expect(stored.tips.map((tip) => tip.source)).toEqual(['pixel', 'pixel', 'pixel']);
    expect(stored.enhancementStatus).toBe('ready');
  });

  it('uses the Gemini sentence when one comes back, and the pixel text when the call fails', async () => {
    const stored = photo();
    photos.push(stored);
    const advise = jest.fn().mockResolvedValue('Halt das Handy ruhig und tritt einen Schritt zurück.');
    tips = { available: true, advise };
    service = build();
    enhance.mockResolvedValue({
      buffer: Buffer.from('enhanced-bytes'),
      mimeType: 'image/jpeg',
      width: 40,
      height: 40,
      capture: { sharpness: 4, brightness: 120, cutOff: false, subjectFill: 1 },
      backgroundCleaned: false,
    });

    await service.enhancePhoto(stored.id);
    expect(stored.tips).toEqual([
      {
        code: 'BLURRY',
        message: 'Halt das Handy ruhig und tritt einen Schritt zurück.',
        source: 'gemini',
      },
    ]);

    advise.mockRejectedValue(new Error('network'));
    stored.enhancementStatus = 'pending';
    await service.enhancePhoto(stored.id);
    expect(stored.tips[0].source).toBe('pixel');
    expect(stored.tips[0].message).toContain('unscharf');
  });

  it('suggests the sharper photo as cover and cleans the background only for the current cover', async () => {
    const cover = photo({ id: 'cover', coverScore: 0.2, enhancementStatus: 'ready', sortOrder: 0 });
    const other = photo({
      id: 'other',
      url: '/uploads/other.jpg',
      storageKey: 'other.png',
      sortOrder: 1,
      createdAt: new Date('2026-11-02T00:00:00.000Z'),
    });
    photos.push(cover, other);

    await service.enhancePhoto(other.id);

    expect(enhance).toHaveBeenCalledWith(expect.any(Buffer), { whiteBackground: false });
    expect(photos.find((item) => item.suggestedCover)?.id).toBe('other');
  });

  it('plans a queue job and skips the queue when enhancement is turned off', async () => {
    await service.enqueue(['photo-1']);
    expect(queue.add).toHaveBeenCalledWith('enhance', { photoId: 'photo-1' }, expect.objectContaining({ attempts: 3 }));

    configValues.PHOTO_ENHANCEMENT_ENABLED = 'false';
    const stored = photo();
    photos.push(stored);
    queue.add.mockClear();
    await service.enqueue([stored.id]);
    expect(queue.add).not.toHaveBeenCalled();
    expect(stored.enhancementStatus).toBe('skipped');
  });

  it('moves the chosen photo to the front and queues both covers again', async () => {
    const first = photo({ id: 'first', sortOrder: 0 });
    const second = photo({ id: 'second', sortOrder: 1, createdAt: new Date('2026-11-02T00:00:00.000Z') });
    photos.push(first, second);

    await service.makeCover('item-1', 'second');

    expect(second.sortOrder).toBe(0);
    expect(first.sortOrder).toBe(1);
    expect(second.enhancementStatus).toBe('pending');
    expect(first.enhancementStatus).toBe('pending');
    expect(queue.add).toHaveBeenCalledWith('enhance', { photoId: 'second' }, expect.any(Object));
    expect(queue.add).toHaveBeenCalledWith('enhance', { photoId: 'first' }, expect.any(Object));
  });

  it('keeps the original and stops the spinner when the queue is down', async () => {
    const stored = photo();
    photos.push(stored);
    queue.add.mockRejectedValue(new Error('redis down'));

    await service.enqueue([stored.id]);

    expect(stored.enhancementStatus).toBe('failed');
    expect(stored.enhancementError).toContain('Original bleibt');
  });

  it('rejects a cover change for an unknown photo', async () => {
    await expect(service.makeCover('item-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
