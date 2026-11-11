import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { AiAnalysisResult, AiVisionProvider } from '../../domain/ai/ai-vision-provider.interface';

const MODEL_ID = 'gemini-flash-latest';
const PROMPT_VERSION = '2026-11-11';

// Taxonomie-Felder plus Marktplatz-Merkmale. ProductAnalysisService legt die
// Kategorie auf die kleine Taxonomie und behält notable_features/visible_defects.
const ATTRIBUTE_KEYS = [
  'category',
  'categoryDetail',
  'color',
  'brand',
  'material',
  'condition',
  'size',
  'measurements',
  'functionChecked',
  'notable_features',
  'visible_defects',
] as const;

const PROMPT = `Analysiere die angehängten Fotos eines gebrauchten Gegenstands für Kleinanzeigen, eBay und Vinted.
Die Fotos können den ganzen Gegenstand, ein Etikett, ein Typenschild oder einen Mangel zeigen. Nutze alle Fotos gemeinsam.

Felder:
- category: genau eine von Kleidung, Schuhe, Elektronik, Medien, Haushalt, Möbel, Sonstiges — oder null, wenn der Gegenstand nicht erkennbar ist.
- categoryDetail: kurze, suchbare Artikelbezeichnung nur aus sichtbaren Merkmalen, z.B. "Nike Air Max 90", "iPhone 13", "Herren Lederjacke". Kein Kategoriepfad wie "Bekleidung > Herren > Jacken". null, wenn die Art nicht erkennbar ist.
- color: Hauptfarbe auf Deutsch, nur wenn sichtbar, sonst null.
- brand: Marke nur bei lesbarem Logo, Aufschrift oder eindeutigem Typenschild, sonst null.
- material: Hauptmaterial nur wenn sichtbar oder auf dem Etikett lesbar, sonst null.
- condition: eine von new, like_new, good, fair, defective, oder null.
- size: Größe nur wenn ein Etikett oder eine Größenangabe sichtbar ist, sonst null. Nicht aus dem Schnitt raten.
- measurements: Maße nur wenn eine Zahl sichtbar ist, sonst null.
- functionChecked: "ja" oder "nein" nur wenn der Betrieb sichtbar ist (z.B. eingeschaltetes Display). Sonst null. Nicht raten.
- notable_features: Besonderheiten die den Verkaufswert erhöhen — z.B. "Mit Originalverpackung", "Rechnung vorhanden". Null wenn keine auffälligen Besonderheiten.
- visible_defects: Sichtbare Mängel kurz beschreiben. Null wenn keine sichtbaren Mängel.

WICHTIG: Wenn du dir bei einem Feld nicht ausreichend sicher bist, gib value=null zurück — rate NICHT. Ein falscher Wert ist schlimmer als kein Wert. "visible_defects: null" bedeutet explizit "keine erkennbaren Mängel auf den Fotos".`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(
    ATTRIBUTE_KEYS.map((key) => [
      key,
      {
        type: 'object',
        properties: {
          value: { type: 'string', nullable: true },
          confidence: { type: 'number' },
        },
        required: ['value', 'confidence'],
      },
    ]),
  ),
  required: [...ATTRIBUTE_KEYS],
};

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.gif': 'image/gif',
};

interface RawAttributeClaim {
  value: string | null;
  confidence: number;
}

/**
 * Echte Gemini-Vision-Anbindung. Ersetzt `MockGeminiVisionProvider` am
 * selben Interface. Liefert nie USER_CONFIRMED — das setzt nur ein Mensch.
 *
 * Lokale Uploads (`/uploads/<key>`) werden von der Platte gelesen.
 * Ein Umweg über PUBLIC_BASE_URL scheitert in Coolify oft, weil
 * `mm.localhost` aus dem Container nicht erreichbar ist. Öffentliche
 * http(s)-URLs (S3) werden weiter per HTTP geholt.
 */
@Injectable()
export class RealGeminiVisionProvider implements AiVisionProvider {
  private readonly logger = new Logger(RealGeminiVisionProvider.name);
  private readonly client: GoogleGenAI;
  private readonly publicBaseUrl: string;
  private readonly uploadDir: string;

  constructor(config: ConfigService) {
    this.client = new GoogleGenAI({ apiKey: config.get<string>('GEMINI_API_KEY') });
    this.publicBaseUrl = config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:3000';
    this.uploadDir = resolve(process.cwd(), config.get<string>('UPLOAD_DIR') ?? 'uploads');
  }

  async analyzeItem(input: { imageUrls: string[] }): Promise<AiAnalysisResult> {
    if (input.imageUrls.length === 0) {
      return { modelId: MODEL_ID, promptVersion: PROMPT_VERSION, attributes: this.emptyClaims() };
    }

    const imageParts = await Promise.all(input.imageUrls.map((url) => this.loadInlinePart(url)));

    let text: string | undefined;
    try {
      const response = await this.client.models.generateContent({
        model: MODEL_ID,
        contents: [{ role: 'user', parts: [{ text: PROMPT }, ...imageParts] }],
        config: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      });
      text = response.text;
    } catch (error) {
      this.logger.error(`Gemini vision request failed: ${(error as Error).message}`);
      throw new Error(
        'Gemini hat die Fotos nicht analysiert. Prüfe GEMINI_API_KEY und das Kontingent in Google AI Studio. Die Fotos bleiben gespeichert.',
      );
    }

    const raw = this.parseResponse(text);

    return {
      modelId: MODEL_ID,
      promptVersion: PROMPT_VERSION,
      attributes: ATTRIBUTE_KEYS.map((key) => ({
        key,
        value: raw[key]?.value?.trim() ? raw[key].value : null,
        confidence: this.clampConfidence(raw[key]?.confidence),
      })),
    };
  }

  private emptyClaims() {
    return ATTRIBUTE_KEYS.map((key) => ({ key, value: null, confidence: 0 }));
  }

  private clampConfidence(value: number | undefined): number {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }

  private parseResponse(text: string | undefined): Record<string, RawAttributeClaim> {
    if (!text) {
      this.logger.warn('Gemini response had no text content — treating all attributes as UNKNOWN');
      return {};
    }
    try {
      return JSON.parse(text) as Record<string, RawAttributeClaim>;
    } catch (error) {
      this.logger.error(`Could not parse Gemini structured output: ${(error as Error).message}`);
      return {};
    }
  }

  private async loadInlinePart(imageUrl: string): Promise<{ inlineData: { mimeType: string; data: string } }> {
    const fromDisk = await this.readLocalUpload(imageUrl);
    if (fromDisk) return fromDisk;
    return this.fetchAsInlinePart(imageUrl);
  }

  private async readLocalUpload(
    imageUrl: string,
  ): Promise<{ inlineData: { mimeType: string; data: string } } | null> {
    const key = this.uploadKey(imageUrl);
    if (!key) return null;
    try {
      const buffer = await readFile(join(this.uploadDir, key));
      const mimeType = MIME_BY_EXTENSION[extname(key).toLowerCase()] ?? 'image/jpeg';
      return { inlineData: { mimeType, data: buffer.toString('base64') } };
    } catch (error) {
      this.logger.warn(`Local upload ${key} was not readable (${(error as Error).message}), trying HTTP`);
      return null;
    }
  }

  /** Nur der Dateiname unter /uploads, kein Pfad dazwischen. */
  private uploadKey(imageUrl: string): string | null {
    let pathname = imageUrl;
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      try {
        pathname = new URL(imageUrl).pathname;
      } catch {
        return null;
      }
    }
    if (!pathname.startsWith('/uploads/')) return null;
    const key = decodeURIComponent(pathname.slice('/uploads/'.length));
    if (!key || key.includes('/') || key.includes('\\') || key.includes('..')) return null;
    return key;
  }

  private async fetchAsInlinePart(imageUrl: string): Promise<{ inlineData: { mimeType: string; data: string } }> {
    const absoluteUrl = imageUrl.startsWith('http') ? imageUrl : `${this.publicBaseUrl}${imageUrl}`;
    let response: Response;
    try {
      response = await fetch(absoluteUrl);
    } catch (error) {
      throw new Error(
        `Foto nicht lesbar (${absoluteUrl}): ${(error as Error).message}. Liegt die Datei lokal, muss sie unter UPLOAD_DIR liegen.`,
      );
    }
    if (!response.ok) {
      throw new Error(
        `Foto nicht lesbar: ${absoluteUrl} (HTTP ${response.status}). Liegt die Datei lokal, muss sie unter UPLOAD_DIR liegen.`,
      );
    }
    const mimeType = response.headers.get('content-type') ?? 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    return { inlineData: { mimeType, data: buffer.toString('base64') } };
  }
}
