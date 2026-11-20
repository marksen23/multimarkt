import sharp from 'sharp';
import { enhanceListingPhoto } from './enhance-photo';
import { heuristicTips } from './photo-tips';

async function jpegWithOrientation(orientation: number): Promise<Buffer> {
  const wide = await sharp({
    create: { width: 240, height: 120, channels: 3, background: { r: 220, g: 30, b: 30 } },
  })
    .jpeg()
    .toBuffer();
  return sharp(wide).withMetadata({ orientation }).jpeg().toBuffer();
}

async function scene(options: {
  width: number;
  height: number;
  background: { r: number; g: number; b: number };
  rect?: { left: number; top: number; width: number; height: number; color: { r: number; g: number; b: number } };
}): Promise<Buffer> {
  const pixels = Buffer.alloc(options.width * options.height * 3);
  for (let i = 0; i < options.width * options.height; i += 1) {
    pixels[i * 3] = options.background.r;
    pixels[i * 3 + 1] = options.background.g;
    pixels[i * 3 + 2] = options.background.b;
  }
  if (options.rect) {
    const { left, top, width, height, color } = options.rect;
    for (let y = top; y < top + height; y += 1) {
      for (let x = left; x < left + width; x += 1) {
        const index = (y * options.width + x) * 3;
        pixels[index] = color.r;
        pixels[index + 1] = color.g;
        pixels[index + 2] = color.b;
      }
    }
  }
  return sharp(pixels, { raw: { width: options.width, height: options.height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function meanBrightness(buffer: Buffer): Promise<number> {
  const { data } = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (const pixel of data) sum += pixel;
  return sum / data.length;
}

describe('enhanceListingPhoto', () => {
  it('applies EXIF orientation and drops EXIF metadata', async () => {
    const turned = await jpegWithOrientation(6);
    const before = await sharp(turned).metadata();
    expect(before.orientation).toBe(6);

    const result = await enhanceListingPhoto(turned, { whiteBackground: false });
    const after = await sharp(result.buffer).metadata();

    expect(result.mimeType).toBe('image/jpeg');
    expect(result.buffer.subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(after.orientation == null || after.orientation === 1).toBe(true);
    expect(after.exif).toBeUndefined();
    expect(after.width).toBe(120);
    expect(after.height).toBe(240);
  });

  it('lifts a dark photo without inventing a white studio', async () => {
    const dark = await scene({
      width: 160,
      height: 160,
      background: { r: 16, g: 16, b: 16 },
      rect: { left: 50, top: 50, width: 60, height: 60, color: { r: 42, g: 42, b: 42 } },
    });
    const before = await meanBrightness(dark);
    const result = await enhanceListingPhoto(dark, { whiteBackground: false });
    const after = await meanBrightness(result.buffer);

    expect(after).toBeGreaterThan(before + 15);
    expect(result.backgroundCleaned).toBe(false);
  });

  it('shrinks a large photo to the marketplace long edge', async () => {
    const large = await sharp({
      create: { width: 1800, height: 900, channels: 3, background: { r: 140, g: 150, b: 160 } },
    })
      .jpeg()
      .toBuffer();
    const result = await enhanceListingPhoto(large, { whiteBackground: false });
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(1600);
  });

  it('crops a centered object and paints a uniform cover background white', async () => {
    const photo = await scene({
      width: 400,
      height: 400,
      background: { r: 188, g: 188, b: 188 },
      rect: { left: 120, top: 120, width: 160, height: 160, color: { r: 210, g: 30, b: 30 } },
    });
    const result = await enhanceListingPhoto(photo, { whiteBackground: true });
    const { data, info } = await sharp(result.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const corner = data[0] + data[1] + data[2];
    const centerIndex = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;

    expect(result.backgroundCleaned).toBe(true);
    expect(result.width).toBeLessThan(360);
    expect(corner).toBeGreaterThan(740);
    expect(data[centerIndex]).toBeGreaterThan(150);
    expect(data[centerIndex + 1]).toBeLessThan(80);
    expect(result.capture.cutOff).toBe(false);
  });

  it('leaves a non-cover photo on its own background', async () => {
    const photo = await scene({
      width: 400,
      height: 400,
      background: { r: 188, g: 188, b: 188 },
      rect: { left: 120, top: 120, width: 160, height: 160, color: { r: 210, g: 30, b: 30 } },
    });
    const result = await enhanceListingPhoto(photo, { whiteBackground: false });
    expect(result.backgroundCleaned).toBe(false);
  });

  it('flags a subject that touches the frame and a flat photo as a phone tip', async () => {
    const cutOff = await scene({
      width: 240,
      height: 240,
      background: { r: 180, g: 180, b: 180 },
      rect: { left: 0, top: 40, width: 140, height: 160, color: { r: 20, g: 90, b: 180 } },
    });
    const flat = await scene({ width: 80, height: 80, background: { r: 128, g: 128, b: 128 } });
    const cut = await enhanceListingPhoto(cutOff, { whiteBackground: false });
    const blurry = await enhanceListingPhoto(flat, { whiteBackground: false });

    expect(heuristicTips(cut.capture).map((tip) => tip.code)).toContain('CUT_OFF');
    expect(heuristicTips(blurry.capture).map((tip) => tip.code)).toContain('BLURRY');
    expect(heuristicTips(blurry.capture).every((tip) => tip.source === 'pixel')).toBe(true);
  });
});
