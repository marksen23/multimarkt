import { ConfigService } from '@nestjs/config';
import { StorageController } from './storage.controller';

describe('StorageController', () => {
  it('reports local disk as not durable', () => {
    const controller = new StorageController({
      get: () => undefined,
    } as unknown as ConfigService);

    expect(controller.status()).toEqual({ durable: false });
  });

  it('reports a configured bucket as durable', () => {
    const controller = new StorageController({
      get: (key: string) => (key === 'S3_BUCKET' ? 'resale-os-photos' : undefined),
    } as unknown as ConfigService);

    expect(controller.status()).toEqual({ durable: true });
  });
});
