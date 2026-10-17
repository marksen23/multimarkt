import { Injectable } from '@nestjs/common';
import {
  CHANNEL_TITLE_LIMITS,
  TitleGenerationInput,
  TitleGenerationProvider,
} from '../../domain/ai/title-generation-provider.interface';

/** Platzhalter für die echte Gemini-Titelgenerierung (siehe RealTitleGenerationProvider). */
@Injectable()
export class MockTitleGenerationProvider implements TitleGenerationProvider {
  async generate(input: TitleGenerationInput): Promise<string | null> {
    const fact = (key: string) =>
      input.attributes.find((attribute) => attribute.key === key)?.value?.trim() || null;
    // Marke, Größe und Maße nur, wenn sie wirklich vorliegen — die Kategorie
    // ersetzt den Titel, wenn noch keiner gesetzt ist.
    const parts = [
      fact('brand'),
      input.title ?? fact('category') ?? 'Artikel',
      fact('size') ?? fact('measurements'),
      input.condition,
    ].filter((part): part is string => !!part);
    return parts.join(' ').slice(0, CHANNEL_TITLE_LIMITS[input.channel]);
  }
}
