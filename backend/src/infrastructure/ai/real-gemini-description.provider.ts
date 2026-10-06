import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  DescriptionGenerationInput,
  DescriptionGenerationProvider,
  SalesGoal,
} from '../../domain/ai/description-generation-provider.interface';
import { ListingChannel } from '../../domain/ai/title-generation-provider.interface';

const MODEL_ID = 'gemini-flash-latest';

const CHANNEL_INSTRUCTIONS: Record<ListingChannel, string> = {
  KLEINANZEIGEN:
    'Schreibe einen sachlichen Kleinanzeigen-Text in Du-Form. Abholung nennen. Wenn keine PLZ bekannt ist, die Zeile "PLZ: (bitte eintragen)" setzen — erfinde keine PLZ. Keine Werbefloskeln.',
  EBAY:
    'Schreibe einen eBay-Text. Ganz vorne suchbare Merkmale (Marke, Kategorie, Farbe, Größe, Material — nur was bekannt ist). Danach Zustand und Lieferumfang explizit in eigenen Sätzen. Keine Werbefloskeln.',
  VINTED:
    'Schreibe einen kurzen Vinted-Text, höchstens drei kurze Sätze: Marke, Größe, Farbe, Maße. Fehlende Maße als "Maße: (bitte eintragen)". Keine Abholgeschichte, keine Werbefloskeln.',
};

const GOAL_INSTRUCTIONS: Record<SalesGoal, string> = {
  FAST_SALE:
    'Verkaufsziel: schneller Verkauf. Betone Verfügbarkeit ("sofort abholbar"), signalisiere Verhandlungsbereitschaft, halte den Text knapp und niedrigschwellig.',
  MAX_PROFIT:
    'Verkaufsziel: maximaler Erlös. Betone Zustand, Seltenheit/Wertigkeit und Pflegezustand ausführlicher, keine Verhandlungssignale, ruhiger/hochwertiger Ton.',
  MINIMAL_EFFORT:
    'Verkaufsziel: minimaler Aufwand. Kurz und sachlich, keine ausschmückenden Details, die zu Rückfragen einladen könnten.',
  BALANCED: 'Verkaufsziel: ausgewogen. Neutraler, sachlich-freundlicher Standardton.',
};

/**
 * Echte Beschreibungs-Generierung (docs/README.md §9b/§9e). Nutzt nur, was
 * der Mensch im Confidence Center gesehen hat (Item-Attribute + bestätigter
 * Zustand) — erfindet keine neuen FAKTEN über das eigene Produkt, formuliert
 * nur einen Verkaufstext aus vorhandenen Werten. Bleibt trotzdem ein
 * VORSCHLAG (siehe Interface-Doku), nie eine automatische Übernahme.
 *
 * §9e-Ergänzung: `comparableListings` sind echte, über Gemini-Grounding
 * gefundene Vergleichsangebote (Titel+Preis) — die einzige tatsächlich
 * vorhandene "Konkurrenzanalyse"-Quelle. Der Prompt darf sie NUR als
 * Formulierungs-Vorbild nutzen (übliche Begriffe/Struktur vergleichbarer
 * Angebote), nie als Faktenquelle für das eigene Produkt — sonst würde
 * genau die "Never silently invent"-Regel über einen Umweg umgangen.
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

    const comparablesBlock =
      input.comparableListings.length > 0
        ? `\nVergleichbare, aktuell aktive Angebote (nur zur Orientierung, wie man sowas üblicherweise beschreibt — NICHT als Faktenquelle für dieses Produkt):\n${input.comparableListings
            .map((c) => `- "${c.title}" (${c.price.toFixed(2)} €)`)
            .join('\n')}`
        : '';

    const goalInstruction = GOAL_INSTRUCTIONS[input.salesGoal ?? 'BALANCED'];
    const gapBlock =
      input.missingTokens && input.missingTokens.length > 0
        ? `\nSuchbegriffe, die in Vergleichstiteln vorkommen und im eigenen Text fehlen: ${input.missingTokens.join(', ')}. Baue nur diejenigen ein, die zu den bekannten Fakten dieses Produkts passen. Erfinde keinen davon.`
        : '';
    const channelLead = input.channel
      ? CHANNEL_INSTRUCTIONS[input.channel]
      : 'Schreibe einen kurzen Verkaufstext (3-5 Sätze, Deutsch) für ein Kleinanzeigen-Inserat.';

    const prompt = `${channelLead}
Titel: ${input.title ?? 'unbekannt'}
Zustand: ${input.condition ?? 'unbekannt'}
Bekannte Merkmale: ${knownFacts || 'keine weiteren Angaben'}
${goalInstruction}
${comparablesBlock}
${gapBlock}

WICHTIG: Verwende für die FAKTEN AUSSCHLIESSLICH die oben genannten Angaben zu diesem Produkt. Erfinde KEINE zusätzlichen Details (keine Marke, kein Material, keine Maße), die dort nicht stehen — auch nicht aus den Vergleichsangeboten übernommen, die sind nur Stil-Vorbild, nicht Faktenquelle. Wenn wenig bekannt ist, bleib entsprechend allgemein, statt Lücken mit Vermutungen zu füllen. Antworte NUR mit dem Beschreibungstext, ohne Anrede, ohne Überschrift, ohne Anführungszeichen.`;

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
