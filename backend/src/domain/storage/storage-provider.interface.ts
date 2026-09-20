/**
 * Storage-Provider-Abstraktion (README §3 Schritt 1 "Foto-Erfassung";
 * Doc 01 §15 S3-Löschjob). Austauschbar wie AI-Vision-Provider und
 * Marketplace-Adapter: ein echter S3Provider ersetzt später nur dieses
 * Binding, kein Aufrufer-Code ändert sich.
 */
export interface UploadInput {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

export interface StoredFile {
  /** Öffentlich abrufbare URL, wird als Bild-URL an die AI-Analyse-Pipeline gereicht. */
  url: string;
  /** Provider-interner Schlüssel/Pfad, nötig für `delete()` (Hard-Delete, Doc 01 §15). */
  key: string;
}

export interface StorageProvider {
  upload(input: UploadInput): Promise<StoredFile>;
  delete(key: string): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
