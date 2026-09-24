import { ImageOptimizationProvider } from '../../domain/ai/image-optimization-provider.interface';
import { StorageProvider } from '../../domain/storage/storage-provider.interface';
import { ImageOptimizationService } from './image-optimization.service';

describe('ImageOptimizationService', () => {
  let provider: jest.Mocked<ImageOptimizationProvider>;
  let storage: jest.Mocked<StorageProvider>;

  beforeEach(() => {
    provider = { optimize: jest.fn() };
    storage = { upload: jest.fn(), delete: jest.fn() };
  });

  it('uploads the optimized image as a NEW file and returns its url', async () => {
    provider.optimize.mockResolvedValue({ buffer: Buffer.from('optimized'), mimeType: 'image/png' });
    storage.upload.mockResolvedValue({ url: '/uploads/optimized-key.png', key: 'optimized-key.png' });

    const service = new ImageOptimizationService(provider, storage);
    const result = await service.optimize({
      buffer: Buffer.from('original'),
      mimeType: 'image/jpeg',
      originalName: 'photo.jpg',
    });

    expect(result).toEqual({ url: '/uploads/optimized-key.png' });
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/png', originalName: 'optimized-photo.jpg' }),
    );
  });

  it('returns null and never touches storage when the provider could not optimize', async () => {
    provider.optimize.mockResolvedValue(null);

    const service = new ImageOptimizationService(provider, storage);
    const result = await service.optimize({
      buffer: Buffer.from('original'),
      mimeType: 'image/jpeg',
      originalName: 'photo.jpg',
    });

    expect(result).toBeNull();
    expect(storage.upload).not.toHaveBeenCalled();
  });
});
