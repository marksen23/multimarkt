import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { AiAnalysisResult, AiVisionProvider } from '../../domain/ai/ai-vision-provider.interface';

const MODEL_ID = 'gemini-flash-latest';
const PROMPT_VERSION = '2026-09-24';

// Dieselben fünf Attribut-Keys wie MockGeminiVisionProvider — der
// Aufrufer (ProductAnalysisService) kennt keine anderen.
const ATTRIBUTE_KEYS = ['category', 'color', 'brand', 'material', 'condition'] as const;

const PROMPT = `Analysiere die angehängten Fotos eines gebrauchten Gegenstands, der weiterverkauft werden soll.
Schätze für jedes der folgenden Felder einen Wert: category (z.B. "Bekleidung > Herren > Jacken"), color, brand, material, condition (eine von: new, like_new, good, fair, defective).
WICHTIG: Wenn du dir bei einem Feld nicht ausreichend sicher bist, gib für dieses Feld value=null zurück — rate NICHT. Ein falscher Wert ist schlimmer als kein Wert, weil ein Mensch diese Angabe später ungeprüft bestätigen könnte.`;

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

interface RawAttributeClaim {
  value: string | null;
  confidence: number;
}

/**
 * Echte Gemini-Vision-Anbindung (docs/README.md Doc 01 §16, §9e). Ersetzt
 * `MockGeminiVisionProvider` 1:1 am selben Interface — kein Aufrufer-Code
 * ändert sich (siehe ProductAnalysisModule für das Umschalten). Liefert wie
 * der Mock NIE `USER_CONFIRMED` (der Typ `AiAttributeClaim` lässt das
 * strukturell gar nicht zu, siehe dortige Doku).
 *
 * Bild-Handling: `imageUrls` sind relative Pfade vom StorageProvider
 * (`/uploads/<key>`, siehe LocalDiskStorageProvider) — Gemini kann damit
 * nichts anfangen, es braucht entweder Bild-Bytes oder eine echte
 * abrufbare URL. Deshalb wird hier `PUBLIC_BASE_URL` + relativer Pfad
 * abgerufen und als Inline-Base64 mitgeschickt (funktioniert unverändert
 * mit einem künftigen S3Provider, dessen URLs schon absolut wären).
 */
@Injectable()
export class RealGeminiVisionProvider implements AiVisionProvider {
  private readonly logger = new Logger(RealGeminiVisionProvider.name);
  private readonly client: GoogleGenAI;
  private readonly publicBaseUrl: string;

  constructor(config: ConfigService) {
    this.client = new GoogleGenAI({ apiKey: config.get<string>('GEMINI_API_KEY') });
    this.publicBaseUrl = config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:3000';
  }

  async analyzeItem(input: { imageUrls: string[] }): Promise<AiAnalysisResult> {
    if (input.imageUrls.length === 0) {
      return { modelId: MODEL_ID, promptVersion: PROMPT_VERSION, attributes: this.emptyClaims() };
    }

    const imageParts = await Promise.all(input.imageUrls.map((url) => this.fetchAsInlinePart(url)));

    const response = await this.client.models.generateContent({
      model: MODEL_ID,
      contents: [{ role: 'user', parts: [{ text: PROMPT }, ...imageParts] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const raw = this.parseResponse(response.text);

    return {
      modelId: MODEL_ID,
      promptVersion: PROMPT_VERSION,
      attributes: ATTRIBUTE_KEYS.map((key) => ({
        key,
        // "Never silently invent" gilt auch hier: ein leerer/whitespace
        // String zählt als kein Wert, nicht als (fälschlich) INFERRED.
        value: raw[key]?.value?.trim() ? raw[key].value : null,
        confidence: raw[key]?.confidence ?? 0,
      })),
    };
  }

  private emptyClaims() {
    return ATTRIBUTE_KEYS.map((key) => ({ key, value: null, confidence: 0 }));
  }

  private parseResponse(text: string | undefined): Record<string, RawAttributeClaim> {
    if (!text) {
      this.logger.warn('Gemini response had no text content — treating all attributes as UNKNOWN');
      return {};
    }
    try {
      return JSON.parse(text) as Record<string, RawAttributeClaim>;
    } catch (error) {
      // Ein Parsing-Fehler darf NIE dazu führen, dass irgendein Wert
      // erfunden wird — stattdessen wird die gesamte Analyse als
      // "nichts erkannt" behandelt (führt zu UNKNOWN je Attribut).
      this.logger.error(`Could not parse Gemini structured output: ${(error as Error).message}`);
      return {};
    }
  }

  private async fetchAsInlinePart(imageUrl: string): Promise<{ inlineData: { mimeType: string; data: string } }> {
    const absoluteUrl = imageUrl.startsWith('http') ? imageUrl : `${this.publicBaseUrl}${imageUrl}`;
    const response = await fetch(absoluteUrl);
    if (!response.ok) {
      throw new Error(`Could not fetch image for Gemini analysis: ${absoluteUrl} (${response.status})`);
    }
    const mimeType = response.headers.get('content-type') ?? 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    return { inlineData: { mimeType, data: buffer.toString('base64') } };
  }
}
