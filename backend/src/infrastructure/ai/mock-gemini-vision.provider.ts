import { Injectable } from '@nestjs/common';
import { AiAnalysisResult, AiVisionProvider } from '../../domain/ai/ai-vision-provider.interface';
import { emptyVisionAttributes } from '../../domain/ai/vision-listing';

/**
 * Läuft, solange kein echter GEMINI_API_KEY gesetzt ist. Liest die Fotos
 * nicht und erfindet keinen Titel, keine Marke und keine Beschreibung.
 * Die Oberfläche weist auf den fehlenden Schlüssel hin.
 */
@Injectable()
export class MockGeminiVisionProvider implements AiVisionProvider {
  async analyzeItem(input: { imageUrls: string[]; hint?: string | null }): Promise<AiAnalysisResult> {
    void input;
    return {
      modelId: 'mock-gemini-vision-stub-v1',
      promptVersion: '2026-11-11-listing',
      attributes: emptyVisionAttributes(),
    };
  }
}
