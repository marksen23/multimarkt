import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { PhotoQualityIssue, PhotoQualityReport } from '../../domain/photo-quality/photo-quality.types';

// Heuristische Schwellwerte, keine Norm — Ziel ist ein grober Hinweis vor
// dem Veröffentlichen, keine exakte Wissenschaft. Bewusst konservativ
// (lieber ein falscher Hinweis als ein übersehenes wirklich unbrauchbares
// Foto).
const SHARPNESS_MIN_VARIANCE = 50;
const BRIGHTNESS_TOO_DARK = 40;
const BRIGHTNESS_TOO_BRIGHT = 215;
const MIN_LONG_EDGE_PX = 800;
const DUPLICATE_HAMMING_MAX = 5; // von 64 Bits im aHash

interface PhotoMetrics {
  width: number;
  height: number;
  sharpnessVariance: number;
  meanBrightness: number;
  aHash: string;
}

/**
 * Rein technische Bildqualitätsprüfung der eigenen Fotos (Schärfe,
 * Belichtung, Auflösung, Duplikate) — deterministische Pixel-Mathematik,
 * keine KI, keine Konkurrenzdaten. Ergebnis ist immer nur ein Hinweis,
 * blockiert nie das Anlegen des Listings (siehe items.controller.ts).
 */
@Injectable()
export class PhotoQualityService {
  private readonly logger = new Logger(PhotoQualityService.name);
  private readonly publicBaseUrl: string;

  constructor(config: ConfigService) {
    this.publicBaseUrl = config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:3000';
  }

  async analyzeUrls(photoUrls: string[]): Promise<PhotoQualityReport> {
    const buffers = await Promise.all(photoUrls.map((url) => this.fetchBytes(url)));
    return this.analyze(buffers);
  }

  async analyze(photoBuffers: Buffer[]): Promise<PhotoQualityReport> {
    const issues: PhotoQualityIssue[] = [];
    const metrics: PhotoMetrics[] = [];

    for (let i = 0; i < photoBuffers.length; i++) {
      try {
        const m = await this.computeMetrics(photoBuffers[i]);
        metrics.push(m);

        if (m.sharpnessVariance < SHARPNESS_MIN_VARIANCE) {
          issues.push({ photoIndex: i, type: 'BLURRY', message: `Foto ${i + 1} wirkt unscharf.` });
        }
        if (m.meanBrightness < BRIGHTNESS_TOO_DARK) {
          issues.push({ photoIndex: i, type: 'TOO_DARK', message: `Foto ${i + 1} ist zu dunkel.` });
        } else if (m.meanBrightness > BRIGHTNESS_TOO_BRIGHT) {
          issues.push({ photoIndex: i, type: 'TOO_BRIGHT', message: `Foto ${i + 1} ist überbelichtet.` });
        }
        if (Math.max(m.width, m.height) < MIN_LONG_EDGE_PX) {
          issues.push({
            photoIndex: i,
            type: 'LOW_RESOLUTION',
            message: `Foto ${i + 1} hat eine niedrige Auflösung (${m.width}×${m.height}px).`,
          });
        }
      } catch (error) {
        this.logger.warn(`Photo quality analysis failed for photo ${i}: ${(error as Error).message}`);
      }
    }

    for (let i = 0; i < metrics.length; i++) {
      for (let j = i + 1; j < metrics.length; j++) {
        if (this.hammingDistance(metrics[i].aHash, metrics[j].aHash) <= DUPLICATE_HAMMING_MAX) {
          issues.push({
            photoIndex: j,
            type: 'DUPLICATE',
            message: `Foto ${j + 1} sieht Foto ${i + 1} sehr ähnlich — evtl. Duplikat.`,
          });
        }
      }
    }

    return { photoCount: photoBuffers.length, issues };
  }

  private async computeMetrics(buffer: Buffer): Promise<PhotoMetrics> {
    const image = sharp(buffer);
    const meta = await image.metadata();

    const { data, info } = await image
      .clone()
      .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return {
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      sharpnessVariance: this.laplacianVariance(data, info.width, info.height),
      meanBrightness: this.meanBrightness(data),
      aHash: await this.averageHash(buffer),
    };
  }

  private laplacianVariance(pixels: Buffer, width: number, height: number): number {
    const laplacians: number[] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const lap =
          -4 * pixels[idx] +
          pixels[idx - 1] +
          pixels[idx + 1] +
          pixels[idx - width] +
          pixels[idx + width];
        laplacians.push(lap);
      }
    }
    if (laplacians.length === 0) return 0;
    const mean = laplacians.reduce((a, b) => a + b, 0) / laplacians.length;
    return laplacians.reduce((a, b) => a + (b - mean) ** 2, 0) / laplacians.length;
  }

  private meanBrightness(pixels: Buffer): number {
    let sum = 0;
    for (const p of pixels) sum += p;
    return pixels.length ? sum / pixels.length : 0;
  }

  private async averageHash(buffer: Buffer): Promise<string> {
    const { data } = await sharp(buffer)
      .resize(8, 8, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const mean = this.meanBrightness(data);
    return Array.from(data)
      .map((p) => (p > mean ? '1' : '0'))
      .join('');
  }

  private hammingDistance(a: string, b: string): number {
    let distance = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) distance++;
    }
    return distance;
  }

  private async fetchBytes(imageUrl: string): Promise<Buffer> {
    const absoluteUrl = imageUrl.startsWith('http') ? imageUrl : `${this.publicBaseUrl}${imageUrl}`;
    const response = await fetch(absoluteUrl);
    if (!response.ok) {
      throw new Error(`Could not fetch photo for quality analysis: ${absoluteUrl} (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
