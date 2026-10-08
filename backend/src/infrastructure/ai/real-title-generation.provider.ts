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
    'Schema: [Marke] [Modell/Kategorie] [Größe/Variante] [variantenkritisches Merkmal] [Zustandskürzel nur falls suchrelevant]. Trenner "|" statt Kommas erlaubt. Keine Füllwörter ("Hammer", "Schnäppchen", "TOP"), kein "VB" im Titel. Größe direkt nach der Artikelbezeichnung falls bekannt.',
  EBAY:
    'Schema: [Marke] [Modell/Artikelbezeichnung] [Größe/Variante] [Zustand] [Besonderheit falls vorhanden]. Suchbegriffe vorne priorisieren. Keine Werbefloskeln. eBay-Käufer suchen oft nach Modellnummern — wo vorhanden einbinden.',
  VINTED:
    'Schema: [Marke] [Artikelart] [Farbe] [Größe]. Größe IMMER nennen wenn bekannt. Auf Vinted ist Größe der erste Suchfilter. Keine Füllwörter.',
};

const CHANNEL_SEO_TIPS: Record<ListingChannel, string> = {
  KLEINANZEIGEN:
    'SEO-Hinweis für Kleinanzeigen: Lokal-Keywords (Städtename) NICHT im Titel — der gehört ins Ortsfeld. Zustandsangabe ("Neu", "gebraucht") nur wenn suchrelevant.',
  EBAY:
    'SEO-Hinweis für eBay: Käufer filtern oft nach Zustand — Zustandsangabe in den Titel wenn relevant. Modell-/Seriennummern erhöhen Auffindbarkeit drastisch.',
  VINTED:
    'SEO-Hinweis für Vinted: Mode-spezifische Begriffe (Schnitt, Stil, Season) können Auffindbarkeit verbessern. Vinted-Käufer suchen häufig nach Marke + Größe.',
};

/**
 * Echte Titel-Generierung (§9e-Ergänzung, September 2026). Nutzt exakt
 * dieselbe Faktenbasis wie RealGeminiDescriptionProvider (Item-Attribute +
 * bestätigter Zustand) — erfindet keine neuen Fakten. `comparableListings`
 * (echte, über Gemini-Grounding gefundene Titel) dienen als reales
 * Vokabular-Vorbild für die im Methodik-Dokument beschriebene
 * Titel-Lückenanalyse, nie als Faktenquelle.
 *
 * Oktober 2026: Neue Attribute (size, notable_features) gezielt priorisiert,
 * kanal-spezifische SEO-Hinweise ergänzt.
 */
@Injectable()
export class RealTitleGenerationProvider implements TitleGenerationProvider {
  private readonly logger = new Logger(RealTitleGenerationProvider.name);
  private readonly client: GoogleGenAI;

  constructor(config: ConfigService) {
    this.client = new GoogleGenAI({ apiKey: config.get<string>('GEMINI_API_KEY') });
  }

  async generate(input: TitleGenerationInput): Promise<string | null> {
    const limit = CHANNEL_TITLE_LIMITS[input.channel];

    // Priorisiere preisrelevante Attribute für den Titel
    const priorityKeys = ['brand', 'size', 'color', 'material'];
    const valueKeys = ['notable_features'];
    const skipKeys = ['visible_defects', 'condition']; // condition kommt als eigenes Feld

    const priorityFacts = input.attributes
      .filter((a) => a.value && priorityKeys.includes(a.key))
      .map((a) => `${a.key}: ${a.value}`)
      .join(', ');

    const otherFacts = input.attributes
      .filter((a) => a.value && !priorityKeys.includes(a.key) && !skipKeys.includes(a.key) && !valueKeys.includes(a.key))
      .map((a) => `${a.key}: ${a.value}`)
      .join(', ');

    const valueFacts = input.attributes
      .filter((a) => a.value && valueKeys.includes(a.key))
      .map((a) => `${a.value}`)
      .join(', ');

    const comparablesBlock =
      input.comparableListings.length > 0
        ? `\nTitel vergleichbarer, aktuell aktiver Angebote (nur als Vokabular-/Formulierungs-Vorbild, welche Suchbegriffe für sowas üblich sind — NICHT als Faktenquelle für dieses Produkt):\n${input.comparableListings
            .map((c) => `- "${c.title}"`)
            .join('\n')}`
        : '';

    const prompt = `Erzeuge einen suchoptimierten Anzeigen-Titel (max. ${limit} Zeichen, Deutsch) für die Plattform ${input.channel}.

Artikel: ${input.title ?? 'unbekannt'}
Zustand: ${input.condition ?? 'unbekannt'}
Priorität-Merkmale (Marke, Größe, Farbe, Material): ${priorityFacts || 'keine'}
Weitere Merkmale: ${otherFacts || 'keine'}
${valueFacts ? `Wertsteigernde Besonderheiten (falls Zeichenzahl erlaubt): ${valueFacts}` : ''}

${CHANNEL_SCHEME[input.channel]}
${CHANNEL_SEO_TIPS[input.channel]}
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
