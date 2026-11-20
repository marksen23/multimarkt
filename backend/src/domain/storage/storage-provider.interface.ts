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

/** Schlüssel aus diesem Prozess, kein vom Client gesetzter Pfad. */
export function assertStorageKey(key: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/.test(key) || key.includes('..')) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}

export interface StorageProvider {
  upload(input: UploadInput): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  read(key: string): Promise<Buffer>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
