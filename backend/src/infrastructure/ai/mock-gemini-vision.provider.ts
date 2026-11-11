import { Injectable } from '@nestjs/common';
import { AiAnalysisResult, AiVisionProvider } from '../../domain/ai/ai-vision-provider.interface';

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

/**
 * Läuft, solange kein echter GEMINI_API_KEY gesetzt ist. Liest die Fotos
 * nicht und erfindet keine Jacke, keine Farbe und keine Marke — ein
 * stiller Platzhalter würde in der Prüfung wie eine echte Analyse
 * aussehen. Die Oberfläche weist auf den fehlenden Schlüssel hin.
 */
@Injectable()
export class MockGeminiVisionProvider implements AiVisionProvider {
  async analyzeItem(input: { imageUrls: string[] }): Promise<AiAnalysisResult> {
    void input;
    return {
      modelId: 'mock-gemini-vision-stub-v1',
      promptVersion: '2026-11-11',
      attributes: ATTRIBUTE_KEYS.map((key) => ({ key, value: null, confidence: 0 })),
    };
  }
}
