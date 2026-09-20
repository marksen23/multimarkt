import { Injectable } from '@nestjs/common';
import { AiAnalysisResult, AiVisionProvider } from '../../domain/ai/ai-vision-provider.interface';

/**
 * Deterministischer Stub für die echte Gemini-Vision-Anbindung (Doc 01 §16).
 * Liefert plausible, aber erfundene Claims mit variierender Konfidenz — nie
 * `USER_CONFIRMED` (siehe `AiAttributeClaim`, der Typ erlaubt das nicht).
 * Ein Feld mit niedriger/fehlender Konfidenz wird bewusst als `value: null`
 * zurückgegeben statt geraten (Prinzip "Never silently invent" gilt auch
 * für den Mock, nicht nur für das Backend-Enforcement).
 */
@Injectable()
export class MockGeminiVisionProvider implements AiVisionProvider {
  async analyzeItem(input: { imageUrls: string[] }): Promise<AiAnalysisResult> {
    const hasImages = input.imageUrls.length > 0;

    return {
      modelId: 'mock-gemini-vision-stub-v1',
      promptVersion: '2026-09-20',
      attributes: hasImages
        ? [
            { key: 'category', value: 'Bekleidung > Herren > Jacken', confidence: 0.91 },
            { key: 'color', value: 'Schwarz', confidence: 0.87 },
            { key: 'brand', value: null, confidence: 0.22 }, // zu unsicher -> UNKNOWN
            { key: 'material', value: 'Polyester', confidence: 0.58 },
            { key: 'condition', value: 'good', confidence: 0.64 }, // Vorschlag, kein Zusicherung
          ]
        : [
            { key: 'category', value: null, confidence: 0 },
            { key: 'color', value: null, confidence: 0 },
            { key: 'brand', value: null, confidence: 0 },
            { key: 'material', value: null, confidence: 0 },
            { key: 'condition', value: null, confidence: 0 },
          ],
    };
  }
}
