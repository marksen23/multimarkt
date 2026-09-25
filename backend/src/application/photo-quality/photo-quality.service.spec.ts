import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { PhotoQualityService } from './photo-quality.service';

function makeConfig(): ConfigService {
  return { get: () => undefined } as unknown as ConfigService;
}

async function solidColorJpeg(r: number, g: number, b: number, size = 40): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r, g, b } },
  })
    .jpeg()
    .toBuffer();
}

async function noiseJpeg(size = 40): Promise<Buffer> {
  const pixels = Buffer.alloc(size * size * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(Math.random() * 256);
  return sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .jpeg()
    .toBuffer();
}

describe('PhotoQualityService', () => {
  const service = new PhotoQualityService(makeConfig());

  it('flags a flat, evenly-lit color image as blurry', async () => {
    const photo = await solidColorJpeg(128, 128, 128);
    const report = await service.analyze([photo]);

    expect(report.photoCount).toBe(1);
    expect(report.issues.some((i) => i.type === 'BLURRY')).toBe(true);
  });

  it('flags a very dark photo as too dark', async () => {
    const photo = await solidColorJpeg(5, 5, 5);
    const report = await service.analyze([photo]);

    expect(report.issues.some((i) => i.type === 'TOO_DARK')).toBe(true);
  });

  it('flags a very bright photo as too bright', async () => {
    const photo = await solidColorJpeg(250, 250, 250);
    const report = await service.analyze([photo]);

    expect(report.issues.some((i) => i.type === 'TOO_BRIGHT')).toBe(true);
  });

  it('flags a small image as low resolution', async () => {
    const photo = await solidColorJpeg(128, 128, 128, 100);
    const report = await service.analyze([photo]);

    expect(report.issues.some((i) => i.type === 'LOW_RESOLUTION')).toBe(true);
  });

  it('does not flag a sharp, well-lit, high-resolution photo', async () => {
    const photo = await noiseJpeg(1000);
    const report = await service.analyze([photo]);

    expect(report.issues.filter((i) => i.type !== 'DUPLICATE')).toHaveLength(0);
  });

  it('flags a second, near-identical photo as a duplicate', async () => {
    const photo = await noiseJpeg(1000);
    const report = await service.analyze([photo, photo]);

    expect(report.issues.some((i) => i.type === 'DUPLICATE' && i.photoIndex === 1)).toBe(true);
  });
});
