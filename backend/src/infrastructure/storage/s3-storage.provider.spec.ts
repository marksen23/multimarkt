import { ConfigService } from '@nestjs/config';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  class FakeCommand {
    constructor(public input: unknown) {}
  }
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
    PutObjectCommand: FakeCommand,
    DeleteObjectCommand: FakeCommand,
  };
});

import { S3StorageProvider } from './s3-storage.provider';

function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const baseConfig = {
  S3_BUCKET: 'resale-os-photos',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_PUBLIC_URL_BASE: 'https://cdn.example.test/',
};

describe('S3StorageProvider', () => {
  beforeEach(() => {
    sendMock.mockReset().mockResolvedValue({});
  });

  it('uploads the buffer and returns a url built from S3_PUBLIC_URL_BASE (trailing slash stripped)', async () => {
    const provider = new S3StorageProvider(makeConfig(baseConfig));
    const result = await provider.upload({
      buffer: Buffer.from('fake-jpeg'),
      mimeType: 'image/jpeg',
      originalName: 'sneaker.jpg',
    });

    expect(result.url).toMatch(/^https:\/\/cdn\.example\.test\/.+\.jpg$/);
    expect(result.key).toMatch(/\.jpg$/);
    const command = sendMock.mock.calls[0][0];
    expect(command.input).toMatchObject({ Bucket: 'resale-os-photos', ContentType: 'image/jpeg' });
  });

  it('does not throw when deleting a key fails (idempotent delete, like LocalDiskStorageProvider)', async () => {
    sendMock.mockRejectedValueOnce(new Error('NoSuchKey'));
    const provider = new S3StorageProvider(makeConfig(baseConfig));

    await expect(provider.delete('missing-key.jpg')).resolves.toBeUndefined();
  });
});
