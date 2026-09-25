import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  DescriptionGenerationInput,
  DescriptionGenerationProvider,
} from '../../domain/ai/description-generation-provider.interface';

const MODEL_ID = 'gemini-flash-latest';

/**
 * Echte Beschreibungs-Generierung (docs/README.md §9b). Nutzt nur, was der
 * Mensch im Confidence Center gesehen hat (Item-Attribute + bestätigter
 * Zustand) — erfindet keine neuen Fakten, formuliert nur einen Verkaufstext
 * aus vorhandenen Werten. Bleibt trotzdem ein VORSCHLAG (siehe Interface-
 * Doku), nie eine automatische Übernahme.
 */
@Injectable()
export class RealGeminiDescriptionProvider implements DescriptionGenerationProvider {
  private readonly logger = new Logger(RealGeminiDescriptionProvider.name);
  private readonly client: GoogleGenAI;

  constructor(config: ConfigService) {
    this.client = new GoogleGenAI({ apiKey: config.get<string>('GEMINI_API_KEY') });
  }

  async generate(input: DescriptionGenerationInput): Promise<string | null> {
    const knownFacts = input.attributes
      .filter((a) => a.value)
      .map((a) => `${a.key}: ${a.value}`)
      .join(', ');

    const prompt = `Schreibe einen kurzen, ehrlichen Verkaufstext (3-5 Sätze, Deutsch) für ein Kleinanzeigen-Inserat.
Titel: ${input.title ?? 'unbekannt'}
Zustand: ${input.condition ?? 'unbekannt'}
Bekannte Merkmale: ${knownFacts || 'keine weiteren Angaben'}

WICHTIG: Verwende AUSSCHLIESSLICH die oben genannten Angaben. Erfinde KEINE zusätzlichen Details (keine Marke, kein Material, keine Maße), die hier nicht stehen. Wenn wenig bekannt ist, bleib entsprechend allgemein, statt Lücken mit Vermutungen zu füllen. Antworte NUR mit dem Beschreibungstext, ohne Anrede, ohne Überschrift, ohne Anführungszeichen.`;

    const response = await this.client.models.generateContent({
      model: MODEL_ID,
      contents: prompt,
    });

    const text = response.text?.trim();
    if (!text) {
      this.logger.warn('Gemini returned no description text — caller falls back to the plain template');
      return null;
    }
    return text;
  }
}
