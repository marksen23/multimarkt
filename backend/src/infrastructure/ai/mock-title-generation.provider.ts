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
    const plain = `${input.title ?? 'Artikel'}${input.condition ? ` ${input.condition}` : ''}`;
    return plain.slice(0, CHANNEL_TITLE_LIMITS[input.channel]);
  }
}
