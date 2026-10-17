import { ConfigService } from '@nestjs/config';
import { isDurablePhotoStorage } from './durable-photo-storage';

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('isDurablePhotoStorage', () => {
  it('is false when no bucket is configured', () => {
    expect(isDurablePhotoStorage(config({}))).toBe(false);
    expect(isDurablePhotoStorage(config({ S3_BUCKET: '' }))).toBe(false);
    expect(isDurablePhotoStorage(config({ S3_BUCKET: '   ' }))).toBe(false);
  });

  it('is true when an S3-compatible bucket name is set', () => {
    expect(isDurablePhotoStorage(config({ S3_BUCKET: 'resale-os-photos' }))).toBe(true);
  });
});
