import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  DescriptionChannel,
  DescriptionGenerationInput,
  DescriptionGenerationProvider,
  SalesGoal,
} from '../../domain/ai/description-generation-provider.interface';

const MODEL_ID = 'gemini-flash-latest';

const GOAL_INSTRUCTIONS: Record<SalesGoal, string> = {
  FAST_SALE:
    'Verkaufsziel: schneller Verkauf. Betone Verfügbarkeit ("sofort abholbar"), signalisiere Verhandlungsbereitschaft, halte den Text knapp und niedrigschwellig.',
  MAX_PROFIT:
    'Verkaufsziel: maximaler Erlös. Betone Zustand, Seltenheit/Wertigkeit und Pflegezustand ausführlicher. Erwähne wertsteigernde Merkmale (OVP, Rechnung, Garantie, selten genutzt) wo vorhanden. Kein "VB", ruhiger/hochwertiger Ton.',
  MINIMAL_EFFORT:
    'Verkaufsziel: minimaler Aufwand. Kurz und sachlich, keine ausschmückenden Details, die zu Rückfragen einladen könnten.',
  BALANCED: 'Verkaufsziel: ausgewogen. Neutraler, sachlich-freundlicher Standardton.',
};

const CHANNEL_INSTRUCTIONS: Record<DescriptionChannel, string> = {
  KLEINANZEIGEN:
    'Plattform: Kleinanzeigen.de. Persönlicher, regional-freundlicher Ton. 3–5 Sätze. Keine Kontaktdaten (Telefon/E-Mail/WhatsApp) im Text — die gehören nur ins Profilfeld. Kein "VB" (gehört ins Preisfeld). Zielgruppe: lokale Privatkäufer.',
  EBAY:
    'Plattform: eBay.de. Sachlich, strukturiert, Zustand klar benennen (wichtig für eBay-Käuferschutz). Relevante Spezifikationen (Maße, Kompatibilität, Modellnummer) direkt nennen. 5–8 Sätze erlaubt. Zielgruppe: deutschlandweite Käufer inkl. Händler.',
  VINTED:
    'Plattform: Vinted.de. Kurz & prägnant, 2–4 Sätze. Größe/Maße prominent im ersten Satz. Modezentrierter, freundlicher Stil. Versandhinweis optional am Ende.',
  GENERIC:
    'Allgemein: neutraler, plattformunabhängiger Sachtext. 3–5 Sätze.',
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
 *
 * Oktober 2026: Kanal-spezifische Beschreibungen (Kleinanzeigen/eBay/Vinted)
 * mit je eigenem Ton, Länge und Struktur. Neue Attribute (size, notable_features,
 * visible_defects) werden eingebunden wenn vorhanden.
 */
@Injectable()
export class RealGeminiDescriptionProvider implements DescriptionGenerationProvider {
  private readonly logger = new Logger(RealGeminiDescriptionProvider.name);
  private readonly client: GoogleGenAI;

  constructor(config: ConfigService) {
    this.client = new GoogleGenAI({ apiKey: config.get<string>('GEMINI_API_KEY') });
  }

  async generate(input: DescriptionGenerationInput): Promise<string | null> {
    const channel: DescriptionChannel = input.channel ?? 'GENERIC';

    // Trenne wertsteigernde Merkmale von Standardattributen für gezieltere Nutzung
    const valueAttributes = input.attributes.filter(
      (a) => a.value && ['notable_features', 'visible_defects', 'size'].includes(a.key),
    );
    const coreAttributes = input.attributes.filter(
      (a) => a.value && !['notable_features', 'visible_defects', 'size', 'condition'].includes(a.key),
    );

    const knownFacts = coreAttributes.map((a) => `${a.key}: ${a.value}`).join(', ');

    const valueFactsBlock = valueAttributes.length > 0
      ? `\nWeitere Merkmale:\n${valueAttributes.map((a) => `- ${a.key}: ${a.value}`).join('\n')}`
      : '';

    const comparablesBlock =
      input.comparableListings.length > 0
        ? `\nVergleichbare, aktuell aktive Angebote (nur zur Orientierung, wie man sowas üblicherweise beschreibt — NICHT als Faktenquelle für dieses Produkt):\n${input.comparableListings
            .map((c) => `- "${c.title}" (${c.price.toFixed(2)} €)`)
            .join('\n')}`
        : '';

    const goalInstruction = GOAL_INSTRUCTIONS[input.salesGoal ?? 'BALANCED'];
    const channelInstruction = CHANNEL_INSTRUCTIONS[channel];

    const prompt = `Schreibe einen Verkaufstext (Deutsch) für ein Kleinanzeigen-Inserat.

${channelInstruction}
${goalInstruction}

Artikel:
Titel: ${input.title ?? 'unbekannt'}
Zustand: ${input.condition ?? 'unbekannt'}
Bekannte Merkmale: ${knownFacts || 'keine weiteren Angaben'}${valueFactsBlock}
${comparablesBlock}

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
