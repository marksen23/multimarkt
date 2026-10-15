import { ConfigService } from '@nestjs/config';

/**
 * Fotos sind nur dauerhaft, wenn ein S3-kompatibler Bucket gesetzt ist.
 * Ohne `S3_BUCKET` (oder mit leerem Wert) bleibt es beim lokalen,
 * flüchtigen Speicher: die Dateien verschwinden beim Neustart, die
 * Datenbankzeilen bleiben.
 */
export function isDurablePhotoStorage(config: ConfigService): boolean {
  const bucket = config.get<string>('S3_BUCKET')?.trim();
  return Boolean(bucket);
}
