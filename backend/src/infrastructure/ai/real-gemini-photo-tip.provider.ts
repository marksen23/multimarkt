import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { PhotoTipProvider, PhotoTipRequest } from '../../domain/ai/photo-tip-provider.interface';
import { PhotoTipCode } from '../../domain/photo/photo-enhancement.types';
import { extractJsonObject } from './extract-json-object';
import { readGeminiText } from './gemini-response-text';

const DEFAULT_MODEL_ID = 'gemini-flash-latest';

const ISSUE_LABEL: Record<PhotoTipCode, string> = {
  BLURRY: 'das Foto ist unscharf',
  TOO_DARK: 'das Foto ist zu dunkel',
  CUT_OFF: 'der Artikel ist angeschnitten',
};

/**
 * Ein kurzer Aufnahmetipp auf Deutsch, nur wenn die Pixelprüfung schon
 * ein konkretes Problem gesehen hat. Kein Ersatz für das Foto und keine
 * Beschreibung des Artikels.
 */
@Injectable()
export class RealGeminiPhotoTipProvider implements PhotoTipProvider {
  readonly available = true;
  private readonly logger = new Logger(RealGeminiPhotoTipProvider.name);
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.client = new GoogleGenAI({ apiKey: config.get<string>('GEMINI_API_KEY') });
    this.model = config.get<string>('GEMINI_VISION_MODEL') ?? DEFAULT_MODEL_ID;
  }

  async advise(input: PhotoTipRequest): Promise<string | null> {
    if (input.issues.length === 0) return null;
    const findings = input.issues.map((issue) => ISSUE_LABEL[issue]).join(', ');
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Die technische Prüfung eines Handyfotos für eine Kleinanzeige hat ergeben: ${findings}.
Schreibe einen kurzen Tipp auf Deutsch (höchstens zwei Sätze), wie die Person das nächste Foto mit dem Handy besser machen kann.
Erfinde keine Eigenschaften des Artikels und keine Mängel am Gegenstand.
Antworte nur als JSON {"tip":"..."}.`,
            },
            { inlineData: { mimeType: input.mimeType, data: input.buffer.toString('base64') } },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: { tip: { type: 'string' } },
          required: ['tip'],
        },
      },
    });

    const parsed = extractJsonObject(readGeminiText(response));
    const tip = typeof parsed?.tip === 'string' ? parsed.tip.trim() : '';
    if (tip.length < 8 || tip.length > 400) {
      this.logger.warn('Gemini photo tip was empty or unusable — keeping the pixel hint');
      return null;
    }
    return tip;
  }
}
