import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  MarketDistributionProvider,
  MarketDistributionQuery,
  MarketDistributionResult,
} from '../../domain/pricing/market-distribution-provider.interface';

const MODEL_ID = 'gemini-flash-latest';

/**
 * Echte Preisrecherche über Gemini + Google Search Grounding
 * (docs/README.md §9e). Bewusst EINE Quelle unter mehreren im
 * PriceTriangulationService, kein Ersatz für die eBay-Browse-API-Quelle
 * — siehe die ausführliche Risiko-Abwägung dort (kein Sold-Price-Zugriff,
 * Scheingenauigkeits-Gefahr, Kosten).
 *
 * Technischer Grund für den Prompt-basierten statt Schema-basierten
 * JSON-Zwang: Gemini erlaubt aktuell nicht zuverlässig, das
 * `google_search`-Tool UND einen strikten `responseSchema` in derselben
 * Anfrage zu kombinieren. Statt zwei API-Calls (teurer, langsamer) wird
 * das Modell im Prompt angewiesen, ausschließlich JSON zu antworten, und
 * die Antwort wird nachsichtig geparst — ein Parse-Fehler führt zu `null`
 * (kein Ergebnis), nie zu erfundenen Zahlen.
 */
@Injectable()
export class RealGeminiGroundingProvider implements MarketDistributionProvider {
  private readonly logger = new Logger(RealGeminiGroundingProvider.name);
  private readonly client: GoogleGenAI;

  constructor(config: ConfigService) {
    this.client = new GoogleGenAI({ apiKey: config.get<string>('GEMINI_API_KEY') });
  }

  async search(query: MarketDistributionQuery): Promise<MarketDistributionResult | null> {
    if (!query.keywords.trim()) return null;

    const prompt = this.buildPrompt(query);

    const interaction = await this.client.interactions.create({
      model: MODEL_ID,
      input: prompt,
      tools: [{ type: 'google_search' }],
    });

    return this.parseResponse(interaction.output_text);
  }

  private buildPrompt(query: MarketDistributionQuery): string {
    return `Du bist ein Marktforschungs-Assistent für den deutschen Gebrauchtwarenmarkt.
Recherchiere über die Google-Suche aktuelle Angebotspreise für: "${query.keywords}"${
      query.condition ? ` (Zustand: ${query.condition})` : ''
    }.
Suche gezielt auf eBay, Kleinanzeigen, Vinted und vergleichbaren Plattformen nach AKTUELL AKTIVEN Angeboten (keine Neupreise, keine Schätzungen ohne Beleg).

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Markdown-Codeblock, ohne Erklärtext davor oder danach:
{"median": number|null, "p25": number|null, "p75": number|null, "sampleSize": number, "comparableListings": [{"title": string, "price": number}]}

Regeln:
- sampleSize = Anzahl der tatsächlich in der Suche gefundenen, vergleichbaren Angebote.
- Wenn sampleSize < 5: setze median, p25 und p75 auf null (nicht genug Datenbasis für eine seriöse Aussage).
- comparableListings: bis zu 5 Beispiele mit echtem Titel und Preis aus den Suchergebnissen.
- Erfinde NIEMALS einen Preis oder eine Anzahl, die nicht durch ein tatsächliches Suchergebnis belegt ist.`;
  }

  private parseResponse(text: string | undefined): MarketDistributionResult | null {
    if (!text) {
      this.logger.warn('Gemini grounding response had no text content');
      return null;
    }

    let parsed: {
      median: number | null;
      p25: number | null;
      p75: number | null;
      sampleSize: number;
      comparableListings?: { title: string; price: number }[];
    };
    try {
      // Modelle halten sich nicht immer strikt an "kein Markdown" — ein
      // ```json-Codeblock wird nachsichtig entfernt, bevor geparst wird.
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      parsed = JSON.parse(cleaned);
    } catch (error) {
      this.logger.error(`Could not parse Gemini grounding output: ${(error as Error).message}`);
      return null;
    }

    if (parsed.median === null || parsed.p25 === null || parsed.p75 === null) {
      // Keine ausreichende Datenbasis laut Modell selbst — kein Ergebnis,
      // keine Scheingenauigkeit (§9e).
      return null;
    }

    return {
      median: parsed.median,
      p25: parsed.p25,
      p75: parsed.p75,
      sampleSize: parsed.sampleSize,
      currency: 'EUR',
      providerLabel: 'Gemini + Google Search Grounding',
      comparableListings: parsed.comparableListings ?? [],
    };
  }
}
