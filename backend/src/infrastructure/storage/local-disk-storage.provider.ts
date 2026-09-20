import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider, StoredFile, UploadInput } from '../../domain/storage/storage-provider.interface';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
};

/**
 * Dev-/Demo-Implementierung: schreibt auf lokale Disk, ausgeliefert über
 * `app.useStaticAssets()` (main.ts).
 *
 * PRODUKTIONS-HINWEIS (siehe Abschlussbericht): Render-Webservices haben
 * ein FLÜCHTIGES Dateisystem — lokal gespeicherte Dateien überleben weder
 * einen Neustart/Deploy noch werden sie zwischen mehreren Instanzen
 * geteilt. Für echten Produktivbetrieb muss dieses Binding durch einen
 * S3Provider ersetzt werden (Interface ist bereits darauf ausgelegt) —
 * das erfordert echte AWS/S3-Credentials, die in diesem Projektstand
 * nicht vorliegen.
 */
@Injectable()
export class LocalDiskStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalDiskStorageProvider.name);
  private readonly uploadDir: string;

  constructor(private readonly config: ConfigService) {
    // Muss mit dem `useStaticAssets()`-Pfad in main.ts übereinstimmen.
    this.uploadDir = join(process.cwd(), this.config.get<string>('UPLOAD_DIR') ?? 'uploads');
  }

  async upload(input: UploadInput): Promise<StoredFile> {
    await mkdir(this.uploadDir, { recursive: true });
    const extension =
      MIME_EXTENSIONS[input.mimeType] ?? (extname(input.originalName) || '.bin');
    const key = `${randomUUID()}${extension}`;
    await writeFile(join(this.uploadDir, key), input.buffer);
    this.logger.log(`Stored upload ${key} (${input.buffer.length} bytes)`);
    return { url: `/uploads/${key}`, key };
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(join(this.uploadDir, key));
    } catch (error) {
      // Bereits gelöscht/nicht vorhanden ist kein Fehlerfall für einen
      // Löschauftrag (Doc 01 §15 S3-Garbage-Collector-Semantik).
      this.logger.warn(`Could not delete ${key}: ${(error as Error).message}`);
    }
  }
}
