import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  CHANNEL_TITLE_LIMITS,
  ListingChannel,
  TitleGenerationInput,
  TitleGenerationProvider,
} from '../../domain/ai/title-generation-provider.interface';

const MODEL_ID = 'gemini-flash-latest';

const CHANNEL_SCHEME: Record<ListingChannel, string> = {
  KLEINANZEIGEN:
    'Schema: [Marke] [Modell/Kategorie] [variantenkritisches Merkmal] [Zustandskürzel, nur falls suchrelevant]. Trenner "|" statt Kommas erlaubt. Keine Füllwörter ("Hammer", "Schnäppchen", "MUSS SEHEN"), kein "VB" im Titel.',
  EBAY:
    'Schema: [Marke] [Modell/Kategorie] [variantenkritisches Merkmal] [Zustand]. Suchbegriffe vorne, keine Werbefloskeln.',
  VINTED: 'Schema: [Marke] [Artikelart] [Farbe] [Größe, falls bekannt]. Keine Füllwörter.',
};

/**
 * Echte Titel-Generierung (§9e-Ergänzung, September 2026). Nutzt exakt
 * dieselbe Faktenbasis wie RealGeminiDescriptionProvider (Item-Attribute +
 * bestätigter Zustand) — erfindet keine neuen Fakten. `comparableListings`
 * (echte, über Gemini-Grounding gefundene Titel) dienen als reales
 * Vokabular-Vorbild für die im Methodik-Dokument beschriebene
 * Titel-Lückenanalyse, nie als Faktenquelle.
 */
@Injectable()
export class RealTitleGenerationProvider implements TitleGenerationProvider {
  private readonly logger = new Logger(RealTitleGenerationProvider.name);
  private readonly client: GoogleGenAI;

  constructor(config: ConfigService) {
    this.client = new GoogleGenAI({ apiKey: config.get<string>('GEMINI_API_KEY') });
  }

  async generate(input: TitleGenerationInput): Promise<string | null> {
    const knownFacts = input.attributes
      .filter((a) => a.value)
      .map((a) => `${a.key}: ${a.value}`)
      .join(', ');

    const limit = CHANNEL_TITLE_LIMITS[input.channel];

    const comparablesBlock =
      input.comparableListings.length > 0
        ? `\nTitel vergleichbarer, aktuell aktiver Angebote (nur als Vokabular-/Formulierungs-Vorbild, welche Suchbegriffe für sowas üblich sind — NICHT als Faktenquelle für dieses Produkt):\n${input.comparableListings
            .map((c) => `- "${c.title}"`)
            .join('\n')}`
        : '';

    const prompt = `Erzeuge einen suchoptimierten Anzeigen-Titel (max. ${limit} Zeichen, Deutsch) für die Plattform ${input.channel}.
Titel/Bezeichnung des Artikels: ${input.title ?? 'unbekannt'}
Zustand: ${input.condition ?? 'unbekannt'}
Bekannte Merkmale: ${knownFacts || 'keine weiteren Angaben'}
${CHANNEL_SCHEME[input.channel]}
${comparablesBlock}

WICHTIG: Verwende für die FAKTEN AUSSCHLIESSLICH die oben genannten Angaben zu diesem Produkt. Erfinde KEINE Marke, kein Modell, keine Größe oder Farbe, die dort nicht steht — auch nicht aus den Vergleichstiteln übernommen, die sind nur Vokabular-Vorbild, nicht Faktenquelle. Halte die Zeichenzahl strikt ein. Antworte NUR mit dem Titel selbst, ohne Anführungszeichen, ohne Erklärung.`;

    const response = await this.client.models.generateContent({
      model: MODEL_ID,
      contents: prompt,
    });

    const text = response.text?.trim();
    if (!text) {
      this.logger.warn('Gemini returned no title text — caller falls back to the plain template');
      return null;
    }
    return text.slice(0, limit);
  }
}
