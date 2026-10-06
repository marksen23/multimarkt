import { Injectable } from '@nestjs/common';
import {
  DescriptionGenerationInput,
  DescriptionGenerationProvider,
} from '../../domain/ai/description-generation-provider.interface';
import { buildChannelDescription } from '../../domain/listing/channel-description';

/**
 * Platzhalter für die echte Gemini-Textgenerierung (siehe
 * RealGeminiDescriptionProvider) — dieselbe einfache Vorlage, die vorher
 * fest in CanonicalListingService stand, jetzt hinter dem austauschbaren
 * Provider-Interface.
 */
@Injectable()
export class MockDescriptionGenerationProvider implements DescriptionGenerationProvider {
  async generate(input: DescriptionGenerationInput): Promise<string | null> {
    if (input.channel) {
      return buildChannelDescription(input.channel, {
        title: input.title,
        condition: input.condition,
        attributes: input.attributes,
        missingTokens: input.missingTokens ?? [],
      });
    }
    return `${input.title ?? 'Artikel'} — Zustand: ${input.condition ?? 'unbekannt'}`;
  }
}
