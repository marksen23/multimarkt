import sharp from 'sharp';
import { CaptureMetrics, EnhancementResult } from './photo-enhancement.types';

const MAX_EDGE = 1600;
const JPEG_QUALITY = 82;
const ANALYSIS_EDGE = 480;

interface SubjectBox {
  left: number;
  top: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
  cutOff: boolean;
  foregroundFraction: number;
  subjectFill: number;
  borderUniform: boolean;
  border: [number, number, number];
  threshold: number;
}

/**
 * Handyfoto für eine Anzeige aufbereiten: EXIF-Drehung anwenden, GPS und
 * andere Metadaten verwerfen, Belichtung und Weißabgleich anheben, auf den
 * Gegenstand zuschneiden, für Marktplätze auf 1600px und JPEG bringen.
 * Weißer Hintergrund nur für das Titelbild und nur bei einheitlichem Grund.
 */
export async function enhanceListingPhoto(
  input: Buffer,
  options: { whiteBackground: boolean },
): Promise<EnhancementResult> {
  const oriented = await sharp(input, { failOn: 'none' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb')
    .removeAlpha()
    .png()
    .toBuffer();

  const capture = await measureCapture(oriented);
  const corrected = await correctTone(oriented, capture.brightness);
  const subject = await findSubject(corrected);

  let working = corrected;
  let backgroundCleaned = false;
  if (
    options.whiteBackground &&
    subject.borderUniform &&
    subject.foregroundFraction >= 0.08 &&
    subject.foregroundFraction <= 0.92
  ) {
    working = await paintBackgroundWhite(corrected, subject);
    backgroundCleaned = true;
  }

  if (!subject.cutOff && subject.foregroundFraction >= 0.08 && subject.foregroundFraction <= 0.9) {
    working = await cropToSubject(working, subject);
  }

  if (backgroundCleaned) {
    working = await padWhite(working, 0.06);
  }

  const buffer = await sharp(working)
    .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true, chromaSubsampling: '4:2:0' })
    .toBuffer();
  const meta = await sharp(buffer).metadata();

  return {
    buffer,
    mimeType: 'image/jpeg',
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    capture,
    backgroundCleaned,
  };
}

async function measureCapture(buffer: Buffer): Promise<CaptureMetrics> {
  const subject = await findSubject(buffer);
  const { data, info } = await sharp(buffer)
    .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    sharpness: laplacianVariance(data, info.width, info.height),
    brightness: mean(data),
    cutOff: subject.cutOff,
    subjectFill: subject.subjectFill,
  };
}

async function correctTone(buffer: Buffer, brightness: number): Promise<Buffer> {
  const stats = await sharp(buffer).stats();
  const channels = stats.channels.slice(0, 3);
  const means = channels.map((channel) => (channel.mean > 1 ? channel.mean : 1));
  const average = (means[0] + means[1] + means[2]) / 3;
  const gain = (value: number) => clamp(average / value, 0.92, 1.08);
  const span = Math.max(...channels.map((channel) => channel.max - channel.min));

  let pipeline = sharp(buffer).recomb([
    [gain(means[0]), 0, 0],
    [0, gain(means[1]), 0],
    [0, 0, gain(means[2])],
  ]);
  // modulate hellt oder dämpft. sharp.gamma() ist dafür ungeeignet:
  // es dunkelt vor dem Skalieren ab und hellt erst danach wieder auf.
  if (brightness < 95) {
    pipeline = pipeline.modulate({ brightness: clamp(120 / Math.max(brightness, 12), 1, 2) });
  } else if (brightness > 200) {
    pipeline = pipeline.modulate({ brightness: 0.9 });
  }
  if (brightness >= 55 && span < 140 && span > 40) {
    pipeline = pipeline.normalise({ lower: 2, upper: 98 });
  }
  return pipeline.png().toBuffer();
}

async function findSubject(buffer: Buffer): Promise<SubjectBox> {
  const full = await sharp(buffer).metadata();
  const imageWidth = full.width ?? 1;
  const imageHeight = full.height ?? 1;
  const { data, info } = await sharp(buffer)
    .resize(ANALYSIS_EDGE, ANALYSIS_EDGE, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const thickness = Math.max(2, Math.round(Math.min(width, height) * 0.03));
  const borderPixels: Array<[number, number, number]> = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x < thickness || y < thickness || x >= width - thickness || y >= height - thickness) {
        const index = (y * width + x) * info.channels;
        borderPixels.push([data[index], data[index + 1], data[index + 2]]);
      }
    }
  }
  const border = medianColor(borderPixels);
  const distances = borderPixels.map((pixel) => colorDistance(pixel, border));
  const borderStd = standardDeviation(distances);
  const borderUniform = borderStd < 22;
  const threshold = Math.max(36, borderStd * 2.5);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let foreground = 0;
  const pixelCount = width * height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * info.channels;
      const distance = colorDistance([data[index], data[index + 1], data[index + 2]], border);
      if (distance <= threshold) continue;
      foreground += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const foregroundFraction = foreground / pixelCount;
  if (foreground < pixelCount * 0.02 || maxX < minX) {
    return {
      left: 0,
      top: 0,
      width: imageWidth,
      height: imageHeight,
      imageWidth,
      imageHeight,
      cutOff: false,
      foregroundFraction: 0,
      subjectFill: 1,
      borderUniform,
      border,
      threshold,
    };
  }

  const scaleX = imageWidth / width;
  const scaleY = imageHeight / height;
  const pad = Math.round(Math.min(imageWidth, imageHeight) * 0.04);
  const left = clamp(Math.floor(minX * scaleX) - pad, 0, imageWidth - 1);
  const top = clamp(Math.floor(minY * scaleY) - pad, 0, imageHeight - 1);
  const right = clamp(Math.ceil((maxX + 1) * scaleX) + pad, left + 1, imageWidth);
  const bottom = clamp(Math.ceil((maxY + 1) * scaleY) + pad, top + 1, imageHeight);
  const touches =
    minX <= 1 || minY <= 1 || maxX >= width - 2 || maxY >= height - 2;

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    imageWidth,
    imageHeight,
    cutOff: touches,
    foregroundFraction,
    subjectFill: ((maxX - minX + 1) * (maxY - minY + 1)) / pixelCount,
    borderUniform,
    border,
    threshold,
  };
}

async function paintBackgroundWhite(buffer: Buffer, subject: SubjectBox): Promise<Buffer> {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  const channels = info.channels;
  for (let i = 0; i < info.width * info.height; i += 1) {
    const index = i * channels;
    const distance = colorDistance([out[index], out[index + 1], out[index + 2]], subject.border);
    if (distance <= subject.threshold) {
      out[index] = 255;
      out[index + 1] = 255;
      out[index + 2] = 255;
    }
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels } })
    .png()
    .toBuffer();
}

async function cropToSubject(buffer: Buffer, subject: SubjectBox): Promise<Buffer> {
  if (subject.width >= subject.imageWidth - 2 && subject.height >= subject.imageHeight - 2) {
    return buffer;
  }
  return sharp(buffer)
    .extract({ left: subject.left, top: subject.top, width: subject.width, height: subject.height })
    .png()
    .toBuffer();
}

async function padWhite(buffer: Buffer, fraction: number): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const pad = Math.max(8, Math.round(Math.max(width, height) * fraction));
  return sharp({
    create: {
      width: width + pad * 2,
      height: height + pad * 2,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: buffer, left: pad, top: pad }])
    .png()
    .toBuffer();
}

function medianColor(pixels: Array<[number, number, number]>): [number, number, number] {
  const channel = (index: 0 | 1 | 2) => {
    const values = pixels.map((pixel) => pixel[index]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 0;
  };
  return [channel(0), channel(1), channel(2)];
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function laplacianVariance(pixels: Buffer, width: number, height: number): number {
  const values: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      values.push(-4 * pixels[index] + pixels[index - 1] + pixels[index + 1] + pixels[index - width] + pixels[index + width]);
    }
  }
  if (values.length === 0) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
}

function mean(pixels: Buffer): number {
  let sum = 0;
  for (const pixel of pixels) sum += pixel;
  return pixels.length ? sum / pixels.length : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
