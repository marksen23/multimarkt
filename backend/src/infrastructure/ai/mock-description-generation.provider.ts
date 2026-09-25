import { Injectable } from '@nestjs/common';
import {
  DescriptionGenerationInput,
  DescriptionGenerationProvider,
} from '../../domain/ai/description-generation-provider.interface';

/**
 * Platzhalter für die echte Gemini-Textgenerierung (siehe
 * RealGeminiDescriptionProvider) — dieselbe einfache Vorlage, die vorher
 * fest in CanonicalListingService stand, jetzt hinter dem austauschbaren
 * Provider-Interface.
 */
@Injectable()
export class MockDescriptionGenerationProvider implements DescriptionGenerationProvider {
  async generate(input: DescriptionGenerationInput): Promise<string | null> {
    return `${input.title ?? 'Artikel'} — Zustand: ${input.condition ?? 'unbekannt'}`;
  }
}
