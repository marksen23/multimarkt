import { Job } from 'bullmq';
import { PhotoEnhancementProcessor } from './photo-enhancement.processor';
import { PhotoEnhancementService } from './photo-enhancement.service';

function job(attemptsMade: number, attempts = 3): Job<{ photoId: string }> {
  return {
    data: { photoId: 'photo-1' },
    attemptsMade,
    opts: { attempts },
  } as Job<{ photoId: string }>;
}

describe('PhotoEnhancementProcessor', () => {
  const enhancement = {
    enhancePhoto: jest.fn(),
    markFailed: jest.fn(),
    markRetry: jest.fn(),
  };

  const processor = new PhotoEnhancementProcessor(enhancement as unknown as PhotoEnhancementService);

  beforeEach(() => {
    enhancement.enhancePhoto.mockReset();
    enhancement.markFailed.mockReset();
    enhancement.markRetry.mockReset();
  });

  it('does not mark the photo failed while retries remain', async () => {
    enhancement.enhancePhoto.mockRejectedValue(new Error('sharp'));
    await expect(processor.process(job(1))).rejects.toThrow('sharp');
    expect(enhancement.markRetry).toHaveBeenCalledWith('photo-1');
    expect(enhancement.markFailed).not.toHaveBeenCalled();
  });

  it('keeps the original and records the failure on the last attempt', async () => {
    enhancement.enhancePhoto.mockRejectedValue(new Error('sharp'));
    await expect(processor.process(job(3))).rejects.toThrow('sharp');
    expect(enhancement.markFailed).toHaveBeenCalledWith('photo-1');
    expect(enhancement.markRetry).not.toHaveBeenCalled();
  });
});
