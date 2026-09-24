import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  ImageOptimizationProvider,
  OptimizeImageInput,
  OptimizeImageResult,
} from '../../domain/ai/image-optimization-provider.interface';

// "Nano Banana 2" — schnellstes/günstigstes aktuelles Gemini-Bildmodell
// (Stand September 2026, siehe ai.google.dev/gemini-api/docs/image-generation),
// für Bildbearbeitung (Text+Bild-zu-Bild), nicht nur Text-zu-Bild.
const MODEL_ID = 'gemini-3.1-flash-image';

const EDIT_INSTRUCTION = `Optimiere dieses Produktfoto für ein Online-Verkaufsinserat:
Hintergrund neutral und aufgeräumt (hell, keine Ablenkung), Produkt klar im Fokus, natürliche Farbkorrektur.
WICHTIG: Verändere das Produkt selbst NICHT — keine anderen Farben, keine anderen Details, keine Beschädigungen entfernen oder hinzufügen. Nur Beleuchtung/Hintergrund/Bildausschnitt verbessern.`;

/**
 * Echte Bildoptimierung über Gemini ("Nano Banana", docs/README.md
 * §9e-Ergänzung). Bewusst NICHT automatisch anstelle des Originalfotos
 * verwendet — der Aufrufer (Controller) speichert das Ergebnis als
 * ZUSÄTZLICHES Bild, der Mensch entscheidet, welches er nutzt.
 */
@Injectable()
export class RealImageOptimizationProvider implements ImageOptimizationProvider {
  private readonly logger = new Logger(RealImageOptimizationProvider.name);
  private readonly client: GoogleGenAI;

  constructor(config: ConfigService) {
    this.client = new GoogleGenAI({ apiKey: config.get<string>('GEMINI_API_KEY') });
  }

  async optimize(input: OptimizeImageInput): Promise<OptimizeImageResult | null> {
    const response = await this.client.models.generateContent({
      model: MODEL_ID,
      contents: [
        {
          role: 'user',
          parts: [
            { text: EDIT_INSTRUCTION },
            { inlineData: { mimeType: input.mimeType, data: input.buffer.toString('base64') } },
          ],
        },
      ],
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData);
    if (!imagePart?.inlineData?.data) {
      this.logger.warn('Gemini image optimization returned no image data — treating as failed, not faking a result');
      return null;
    }

    return {
      buffer: Buffer.from(imagePart.inlineData.data, 'base64'),
      mimeType: imagePart.inlineData.mimeType ?? input.mimeType,
    };
  }
}
