import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { StorageProvider, StoredFile, UploadInput } from '../../domain/storage/storage-provider.interface';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
};

/**
 * Echter Storage-Provider (docs/README.md, LocalDiskStorageProvider-Doku:
 * "Render-Webservices haben ein flüchtiges Dateisystem"). S3-kompatible
 * API statt AWS-spezifisch — funktioniert unverändert mit Cloudflare R2,
 * Backblaze B2, MinIO usw., nicht nur AWS S3 (nur `S3_ENDPOINT` anpassen).
 *
 * `S3_PUBLIC_URL_BASE` ist bewusst getrennt vom Endpoint: bei den meisten
 * S3-kompatiblen Anbietern (v.a. Cloudflare R2) ist die Upload-API-URL
 * NICHT dieselbe wie die öffentlich lesbare URL (R2 braucht dafür einen
 * separat freigeschalteten Public-Bucket-Zugang oder eine eigene Domain).
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrlBase: string;

  constructor(config: ConfigService) {
    const region = config.get<string>('S3_REGION') ?? 'auto';
    const endpoint = config.get<string>('S3_ENDPOINT');
    this.bucket = config.get<string>('S3_BUCKET')!;
    this.publicUrlBase = (config.get<string>('S3_PUBLIC_URL_BASE') ?? '').replace(/\/$/, '');

    this.client = new S3Client({
      region,
      endpoint,
      // R2/andere S3-kompatible Endpoints brauchen Path-Style statt
      // Virtual-Hosted-Style-URLs — bei echtem AWS S3 (kein `endpoint`
      // gesetzt) bleibt das Standardverhalten unverändert.
      forcePathStyle: !!endpoint,
      credentials: {
        accessKeyId: config.get<string>('S3_ACCESS_KEY_ID')!,
        secretAccessKey: config.get<string>('S3_SECRET_ACCESS_KEY')!,
      },
    });
  }

  async upload(input: UploadInput): Promise<StoredFile> {
    const extension = MIME_EXTENSIONS[input.mimeType] ?? (extname(input.originalName) || '.bin');
    const key = `${randomUUID()}${extension}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType,
      }),
    );

    this.logger.log(`Stored upload ${key} (${input.buffer.length} bytes) in bucket ${this.bucket}`);
    return { url: `${this.publicUrlBase}/${key}`, key };
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      // Wie LocalDiskStorageProvider: bereits gelöscht/nicht vorhanden ist
      // kein Fehlerfall für einen Löschauftrag (Doc 01 §15).
      this.logger.warn(`Could not delete ${key}: ${(error as Error).message}`);
    }
  }
}
