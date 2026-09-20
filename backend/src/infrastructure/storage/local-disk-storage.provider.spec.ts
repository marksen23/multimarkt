import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { LocalDiskStorageProvider } from './local-disk-storage.provider';

describe('LocalDiskStorageProvider', () => {
  const testUploadDir = 'test-uploads-tmp';
  let provider: LocalDiskStorageProvider;

  beforeEach(() => {
    const config = { get: (key: string) => (key === 'UPLOAD_DIR' ? testUploadDir : undefined) };
    provider = new LocalDiskStorageProvider(config as unknown as ConfigService);
  });

  afterEach(async () => {
    await rm(join(process.cwd(), testUploadDir), { recursive: true, force: true });
  });

  it('writes the uploaded buffer to disk and returns a resolvable url/key', async () => {
    const buffer = Buffer.from('fake-jpeg-bytes');
    const result = await provider.upload({
      buffer,
      mimeType: 'image/jpeg',
      originalName: 'sneaker.jpg',
    });

    expect(result.url).toMatch(/^\/uploads\/.+\.jpg$/);
    expect(result.key).toMatch(/\.jpg$/);

    const written = await readFile(join(process.cwd(), testUploadDir, result.key));
    expect(written.equals(buffer)).toBe(true);
  });

  it('derives the extension from the mime type, not just the original filename', async () => {
    const result = await provider.upload({
      buffer: Buffer.from('x'),
      mimeType: 'image/png',
      originalName: 'photo-without-extension',
    });
    expect(result.key.endsWith('.png')).toBe(true);
  });

  it('generates distinct keys for concurrent uploads (no filename collisions)', async () => {
    const [a, b] = await Promise.all([
      provider.upload({ buffer: Buffer.from('a'), mimeType: 'image/jpeg', originalName: 'a.jpg' }),
      provider.upload({ buffer: Buffer.from('b'), mimeType: 'image/jpeg', originalName: 'b.jpg' }),
    ]);
    expect(a.key).not.toBe(b.key);
  });

  it('delete() removes the file; a second delete() of the same key does not throw', async () => {
    const result = await provider.upload({
      buffer: Buffer.from('x'),
      mimeType: 'image/webp',
      originalName: 'x.webp',
    });
    const filePath = join(process.cwd(), testUploadDir, result.key);
    expect(existsSync(filePath)).toBe(true);

    await provider.delete(result.key);
    expect(existsSync(filePath)).toBe(false);

    await expect(provider.delete(result.key)).resolves.toBeUndefined();
  });
});
