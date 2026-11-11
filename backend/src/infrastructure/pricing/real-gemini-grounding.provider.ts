import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  ComparableListing,
  MarketDistributionProvider,
  MarketDistributionQuery,
  MarketDistributionResult,
} from '../../domain/pricing/market-distribution-provider.interface';
import { extractJsonObject } from '../ai/extract-json-object';

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

    try {
      const interaction = await this.client.interactions.create({
        model: MODEL_ID,
        input: prompt,
        tools: [{ type: 'google_search' }],
      });
      return this.parseResponse(interaction.output_text);
    } catch (error) {
      this.logger.error(`Gemini grounding search failed: ${(error as Error).message}`);
      return null;
    }
  }

  private buildPrompt(query: MarketDistributionQuery): string {
    return `Du bist ein Marktforschungs-Assistent für den deutschen Gebrauchtwarenmarkt.
Recherchiere über die Google-Suche aktuelle Angebotspreise für: "${query.keywords}"${
      query.condition ? ` (Zustand: ${query.condition})` : ''
    }.
Suche gezielt auf eBay, Kleinanzeigen, Vinted und vergleichbaren Plattformen nach AKTUELL AKTIVEN Angeboten (keine Neupreise, keine Schätzungen ohne Beleg).

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Markdown-Codeblock, ohne Erklärtext davor oder danach:
{"median": number|null, "p25": number|null, "p75": number|null, "sampleSize": number, "comparableListings": [{"title": string, "price": number, "url": string|null}]}

Regeln:
- sampleSize = Anzahl der tatsächlich in der Suche gefundenen, vergleichbaren Angebote.
- comparableListings: bis zu 8 Beispiele. title und price nur aus einem konkreten Suchtreffer. url nur, wenn der Link im Suchergebnis steht, sonst null.
- Wenn weniger als fünf Angebote gefunden wurden, setze median, p25 und p75 auf null, lass die gefundenen comparableListings aber stehen.
- Erfinde NIEMALS einen Preis, einen Titel oder eine URL.`;
  }

  private parseResponse(text: string | undefined): MarketDistributionResult | null {
    const parsed = extractJsonObject(text);
    if (!parsed) {
      this.logger.warn('Gemini grounding response had no JSON object');
      return null;
    }

    const listings = parseListings(parsed.comparableListings);
    const statedMedian = finiteOrNull(parsed.median);
    const statedP25 = finiteOrNull(parsed.p25);
    const statedP75 = finiteOrNull(parsed.p75);
    const fromListings = listings.length > 0 ? distributionFrom(listings.map((listing) => listing.price)) : null;

    // Dünne Stichproben lässt das Modell oft mit median=null stehen.
    // Die einzelnen Preise bleiben nutzbar; unter fünf Vergleichen
    // entscheidet PriceRecommendationService, dass es nur eine Spanne gibt.
    const median = statedMedian ?? fromListings?.median ?? null;
    const p25 = statedP25 ?? fromListings?.p25 ?? null;
    const p75 = statedP75 ?? fromListings?.p75 ?? null;
    if (median === null || p25 === null || p75 === null) return null;

    // sampleSize darf größer sein als die mitgelieferten Beispiele:
    // das Modell fasst die Suche zusammen und zeigt nur ein paar Titel.
    const statedSample = finiteOrNull(parsed.sampleSize);
    const sampleSize = Math.max(listings.length, statedSample !== null && statedSample > 0 ? statedSample : 0);
    if (sampleSize < 1) return null;

    return {
      median,
      p25,
      p75,
      sampleSize,
      currency: 'EUR',
      providerLabel: 'Gemini + Google Search Grounding',
      comparableListings: listings,
    };
  }
}

function finiteOrNull(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() === '') return null;
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseListings(value: unknown): ComparableListing[] {
  if (!Array.isArray(value)) return [];
  const listings: ComparableListing[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const item = raw as Record<string, unknown>;
    const price = finiteOrNull(item.price);
    if (price === null || price <= 0 || typeof item.title !== 'string' || !item.title.trim()) continue;
    const url = typeof item.url === 'string' && /^https?:\/\//i.test(item.url) ? item.url : null;
    listings.push({ title: item.title.trim(), price, url });
  }
  return listings;
}

function distributionFrom(prices: number[]): { median: number; p25: number; p75: number } {
  const sorted = [...prices].sort((a, b) => a - b);
  return {
    median: percentile(sorted, 0.5),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return Math.round(sorted[0] * 100) / 100;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return Math.round(((sorted[lo] + sorted[hi]) / 2) * 100) / 100;
}
