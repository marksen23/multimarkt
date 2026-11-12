import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { AiAnalysisResult, AiVisionProvider } from '../../domain/ai/ai-vision-provider.interface';
import {
  mapVisionPayload,
  sanitizeVisionHint,
  selectVisionImageUrls,
  VISION_FIELD_KEYS,
} from '../../domain/ai/vision-listing';
import { extractJsonObject } from './extract-json-object';
import { readGeminiText } from './gemini-response-text';
import { publicVisionError, redactSecrets } from './vision-error';

const DEFAULT_MODEL_ID = 'gemini-flash-latest';
const PROMPT_VERSION = '2026-11-11-listing';

const CLAIM_KEYS = [
  'category',
  'categoryDetail',
  'color',
  'brand',
  'model',
  'material',
  'condition',
  'size',
  'measurements',
  'functionChecked',
  'notable_features',
  'visible_defects',
  'title',
  'description',
  'searchTerms',
] as const;

const claimSchema = {
  type: 'object',
  properties: {
    value: { type: 'string', nullable: true },
    confidence: { type: 'number' },
  },
  required: ['value', 'confidence'],
};

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    ...Object.fromEntries(CLAIM_KEYS.map((key) => [key, claimSchema])),
    specs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['name', 'value', 'confidence'],
      },
    },
  },
  required: [...CLAIM_KEYS],
};

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.gif': 'image/gif',
};

/**
 * Echte Gemini-Vision-Anbindung. Liefert nie USER_CONFIRMED — das setzt nur
 * ein Mensch. Lokale Uploads (`/uploads/<key>`) werden von der Platte gelesen.
 * Ein Umweg über PUBLIC_BASE_URL scheitert in Coolify oft, weil `mm.localhost`
 * aus dem Container nicht erreichbar ist.
 */
@Injectable()
export class RealGeminiVisionProvider implements AiVisionProvider {
  private readonly logger = new Logger(RealGeminiVisionProvider.name);
  private readonly client: GoogleGenAI;
  private readonly publicBaseUrl: string;
  private readonly uploadDir: string;
  private readonly modelId: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GEMINI_API_KEY') ?? '';
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
    this.publicBaseUrl = config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:3000';
    this.uploadDir = resolve(process.cwd(), config.get<string>('UPLOAD_DIR') ?? 'uploads');
    const configured = config.get<string>('GEMINI_VISION_MODEL')?.trim();
    this.modelId = configured || DEFAULT_MODEL_ID;
  }

  async analyzeItem(input: { imageUrls: string[]; hint?: string | null }): Promise<AiAnalysisResult> {
    const imageUrls = selectVisionImageUrls(input.imageUrls);
    if (imageUrls.length === 0) {
      return {
        modelId: this.modelId,
        promptVersion: PROMPT_VERSION,
        attributes: VISION_FIELD_KEYS.map((key) => ({ key, value: null, confidence: 0 })),
      };
    }

    const hint = sanitizeVisionHint(input.hint);
    const imageParts = await Promise.all(imageUrls.map((url) => this.loadInlinePart(url)));
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: buildVisionPrompt(hint, imageParts.length) },
    ];
    imageParts.forEach((image, index) => {
      parts.push({ text: `Foto ${index + 1} von ${imageParts.length}` });
      parts.push(image);
    });

    let text: string | undefined;
    try {
      const response = await this.client.models.generateContent({
        model: this.modelId,
        contents: [{ role: 'user', parts }],
        config: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          // Denken frisst bei Flash oft das JSON-Budget. Für das Auslesen reicht die Antwort.
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      });
      text = readGeminiText(response);
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'unknown vision error';
      this.logger.error(`Gemini vision request failed: ${redactSecrets(raw, this.apiKey)}`);
      throw new Error(publicVisionError(error, this.apiKey));
    }

    const parsed = extractJsonObject(text);
    if (!parsed) {
      this.logger.error('Gemini vision response was not a JSON object');
      throw new Error(
        'Gemini hat geantwortet, aber nicht im erwarteten Format. Bitte die Analyse erneut starten. Die Fotos bleiben gespeichert.',
      );
    }

    return {
      modelId: this.modelId,
      promptVersion: PROMPT_VERSION,
      attributes: mapVisionPayload(parsed).attributes,
    };
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

export function buildVisionPrompt(hint: string | null, imageCount: number): string {
  const hintBlock = hint
    ? `

Hinweis des Verkäufers: "${hint}"
Der Hinweis ist eine Hilfe, kein Beweis. Übernimm Marke oder Artikelart daraus nur, wenn das Foto nicht widerspricht. Steht die Angabe nicht auf dem Foto, setze die Konfidenz unter 0,6. Erfinde keine Maße, keine Leistung und keinen Zustand aus dem Hinweis.`
    : '';

  return `Du füllst ein Kleinanzeigen-Inserat für einen gebrauchten Gegenstand anhand von ${imageCount} Foto${imageCount === 1 ? '' : 's'}. Die Fotos gehören zum selben Gegenstand: Übersicht, Detail, Etikett, Typenschild oder Mangel. Nutze alle Fotos zusammen. Eine lesbare Aufschrift schlägt eine Vermutung aus der Form.

Lies Logos, Etiketten, Typenschilder, Größenangaben und Modellnummern buchstabengetreu. Eine Nummer wie "GBH 2-28 F" gehört ins Feld model.

Felder, jedes als Objekt mit value (string oder null) und confidence (0 bis 1):
- category: genau eine von Kleidung, Schuhe, Elektronik, Medien, Haushalt, Möbel, Sonstiges. Elektrowerkzeug, Haushaltsgeräte mit Strom und Unterhaltungselektronik sind Elektronik. null, wenn der Gegenstand nicht erkennbar ist.
- categoryDetail: suchbare Artikelart auf Deutsch, zum Beispiel "Schlagbohrmaschine", "Herren Lederjacke", "iPhone 13". Kein Kategoriepfad. null, wenn die Art nicht erkennbar ist.
- brand: nur bei lesbarem Logo oder Text, sonst null. Nicht aus der Form schließen.
- model: Modellname oder Modellnummer nur wenn lesbar, sonst null.
- color: Hauptfarbe auf Deutsch, nur wenn sichtbar, sonst null.
- material: nur wenn sichtbar oder auf dem Etikett, sonst null.
- condition: new, like_new, good, fair oder defective.
  new = ungeöffnet oder Originalverpackung ohne Gebrauchsspuren.
  like_new = keine sichtbaren Spuren.
  good = normale Gebrauchsspuren.
  fair = deutliche Kratzer, Verfärbung oder Abnutzung.
  defective = Bruch, Riss, fehlende Teile oder Brandspuren.
  null, wenn die Fotos den Zustand nicht hergeben.
- size: nur vom Etikett oder einer sichtbaren Größenangabe, sonst null. Nicht aus dem Schnitt raten.
- measurements: nur wenn eine Zahl im Bild steht, sonst null.
- functionChecked: "ja" oder "nein" nur wenn der Betrieb sichtbar ist, zum Beispiel ein eingeschaltetes Display. Sonst null.
- notable_features: verkaufsrelevante Besonderheit, die wirklich zu sehen ist, zum Beispiel Koffer oder Originalverpackung. Sonst null.
- visible_defects: sichtbare Mängel in einem kurzen deutschen Satz. null, wenn kein Mangel zu sehen ist.
- title: deutscher Inseratstitel, höchstens 80 Zeichen. Aufbau: Marke, Modell, Artikelart, wichtige Angabe, Farbe, Größe — nur die Teile, die belegt sind. Keine Wörter wie Verkaufe, VB, TOP, Hammer oder Schnäppchen.
- description: zwei bis vier deutsche Sätze. Was es ist, welche lesbaren Daten und welches Zubehör zu sehen sind, welcher Zustand und welche Mängel. Kein Preis, keine Kontaktdaten, kein VB. Wenn wenig erkennbar ist, kurz bleiben.
- searchTerms: Marke, Modell und Artikelart, so wie man sie bei eBay suchen würde. Kein Zustand, keine Werbewörter.
- specs: Liste lesbarer technischer Angaben. Jeder Eintrag hat name, value und confidence. Namen auf Deutsch, zum Beispiel Leistung, Spannung, Speicher, Akkuspannung, Plattform oder Autor. Höchstens 6 Einträge. Nur was im Bild steht.

Konfidenz 0,9 und höher nur bei klar lesbarem oder eindeutig sichtbarem Wert. Unter 0,65, wenn du unsicher bist, den Wert aber nicht verwerfen willst. value null, wenn du raten müsstest. Ein falscher Wert ist schlimmer als null. visible_defects null heißt: auf den Fotos ist kein Mangel zu sehen.${hintBlock}`;
}
