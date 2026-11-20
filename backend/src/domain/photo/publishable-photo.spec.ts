import { comparePhotoOrder, coverThumbnailUrl, publishablePhoto } from './publishable-photo';

const original = {
  url: '/uploads/original.jpg',
  storageKey: 'original.jpg',
  enhancedUrl: '/uploads/enhanced.jpg',
  enhancedStorageKey: 'enhanced.jpg',
  enhancementStatus: 'ready' as const,
  preferEnhanced: true,
};

describe('publishablePhoto', () => {
  it('publishes the enhanced file when it is ready and selected', () => {
    expect(publishablePhoto(original)).toEqual({
      url: '/uploads/enhanced.jpg',
      storageKey: 'enhanced.jpg',
    });
  });

  it('publishes the original while enhancement is still running, failed, or switched off', () => {
    expect(publishablePhoto({ ...original, preferEnhanced: false }).storageKey).toBe('original.jpg');
    expect(publishablePhoto({ ...original, enhancementStatus: 'pending' }).storageKey).toBe('original.jpg');
    expect(publishablePhoto({ ...original, enhancementStatus: 'failed' }).storageKey).toBe('original.jpg');
    expect(publishablePhoto({ ...original, enhancedUrl: null, enhancedStorageKey: null }).storageKey).toBe(
      'original.jpg',
    );
  });
});

describe('coverThumbnailUrl', () => {
  it('uses the cover photo in sort order and its enhanced url', () => {
    const thumbnails = coverThumbnailUrl([
      {
        ...original,
        itemId: 'item-1',
        sortOrder: 1,
        createdAt: '2026-11-01T00:00:00.000Z',
        url: '/uploads/second.jpg',
        storageKey: 'second.jpg',
      },
      {
        ...original,
        itemId: 'item-1',
        sortOrder: 0,
        createdAt: '2026-11-02T00:00:00.000Z',
        preferEnhanced: true,
      },
    ]);
    expect(thumbnails.get('item-1')).toBe('/uploads/enhanced.jpg');
  });
});

describe('comparePhotoOrder', () => {
  it('orders by sort position and then by creation time', () => {
    const photos = [
      { sortOrder: 1, createdAt: '2026-11-01T00:00:00.000Z' },
      { sortOrder: 0, createdAt: '2026-11-03T00:00:00.000Z' },
      { sortOrder: 1, createdAt: '2026-11-01T00:00:01.000Z' },
    ];
    expect(photos.slice().sort(comparePhotoOrder).map((photo) => photo.createdAt)).toEqual([
      '2026-11-03T00:00:00.000Z',
      '2026-11-01T00:00:00.000Z',
      '2026-11-01T00:00:01.000Z',
    ]);
  });
});
