import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import type {
  AnkaufSearchProvider,
  AnkaufSearchProviderResult,
  AnkaufSearchQuery,
  RawAnkaufListing,
} from '../../domain/ankauf/ankauf-search-provider.interface';
import type { AnkaufPlatform } from '../../domain/ankauf/ankauf.types';
import { extractJsonObject } from '../ai/extract-json-object';

const MODEL_ID = 'gemini-flash-latest';

const PLATFORM_MAP: Record<string, AnkaufPlatform> = {
  kleinanzeigen: 'KLEINANZEIGEN',
  ebay: 'EBAY',
  vinted: 'VINTED',
  facebook: 'FACEBOOK',
};

function normalizePlatform(raw: string): AnkaufPlatform {
  const key = raw.toLowerCase().trim();
  for (const [fragment, platform] of Object.entries(PLATFORM_MAP)) {
    if (key.includes(fragment)) return platform;
  }
  return 'SONSTIGE';
}

/**
 * Nutzt Gemini + Google Search Grounding für Käufer-seitige Recherche:
 * sucht auf Kleinanzeigen, eBay, Vinted nach aktuellen Gebrauchtangeboten
 * und liefert individuelle Listings mit URL sowie einen Markt-Medianpreis.
 * Gleiche Einschränkungen wie RealGeminiGroundingProvider:
 * `google_search`-Tool + responseSchema gleichzeitig nicht zuverlässig
 * möglich → Prompt-basierter JSON-Zwang, Parse-Fehler führt zu null.
 */
@Injectable()
export class RealAnkaufGeminiProvider implements AnkaufSearchProvider {
  private readonly logger = new Logger(RealAnkaufGeminiProvider.name);
  private readonly client: GoogleGenAI;

  constructor(config: ConfigService) {
    this.client = new GoogleGenAI({ apiKey: config.get<string>('GEMINI_API_KEY') });
  }

  async search(query: AnkaufSearchQuery): Promise<AnkaufSearchProviderResult | null> {
    if (!query.keywords.trim()) return null;

    try {
      const interaction = await this.client.interactions.create({
        model: MODEL_ID,
        input: this.buildPrompt(query),
        tools: [{ type: 'google_search' }],
      });
      return this.parseResponse(interaction.output_text);
    } catch (error) {
      this.logger.error(`Ankauf search failed: ${(error as Error).message}`);
      return null;
    }
  }

  private buildPrompt(query: AnkaufSearchQuery): string {
    return `Du bist ein Gebrauchtwarenkauf-Assistent.
Suche über Google nach AKTUELLEN Privatverkauf-Angeboten für: "${query.keywords}" in ${query.location}, Deutschland.
Durchsuche Kleinanzeigen.de, eBay.de, Vinted.de und Facebook Marketplace.

Antworte AUSSCHLIESSLICH mit validem JSON, kein Markdown, kein Erklärtext:
{
  "marketMedian": <fairer Marktpreis in EUR als Zahl oder null>,
  "listings": [
    {
      "title": "<exakter Anzeigentitel>",
      "price": <Preis als Zahl in EUR>,
      "platform": "<Kleinanzeigen|eBay|Vinted|Facebook|Sonstige>",
      "url": "<direkte Anzeigen-URL als String oder null>",
      "condition": "<Zustandsbeschreibung aus der Anzeige als String oder null>"
    }
  ]
}

Regeln:
- Gib bis zu 12 aktuelle Listings zurück.
- Erfinde KEINE URLs, Preise oder Titel — nur belegte Suchergebnisse.
- marketMedian: Schätze den fairen Marktpreis für diesen Artikel im beschriebenen Zustand auf Basis der Suchergebnisse, oder null wenn keine Datenbasis.
- Preis immer als Zahl (keine Einheit, kein "€").
- condition: die Zustandsangabe der Quelle, wörtlich. null, wenn die Anzeige keinen Zustand nennt. Den Zustand nicht aus dem Titel ableiten.`;
  }

  private parseResponse(text: string | undefined): AnkaufSearchProviderResult | null {
    const parsed = extractJsonObject(text);
    if (!parsed || !Array.isArray(parsed.listings)) {
      this.logger.warn('Ankauf Gemini response had no listings array');
      return null;
    }

    const listings: RawAnkaufListing[] = [];
    for (const raw of parsed.listings) {
      if (typeof raw !== 'object' || raw === null) continue;
      const item = raw as Record<string, unknown>;
      const price = Number(item.price);
      if (!Number.isNaN(price) && price > 0 && typeof item.title === 'string' && item.title.trim()) {
        const url = typeof item.url === 'string' && /^https?:\/\//i.test(item.url) ? item.url : null;
        listings.push({
          title: item.title.trim(),
          price,
          platform: normalizePlatform(String(item.platform ?? '')),
          url,
          condition: typeof item.condition === 'string' && item.condition.trim() ? item.condition.trim() : null,
        });
      }
    }

    const marketMedian = typeof parsed.marketMedian === 'number' && Number.isFinite(parsed.marketMedian)
      ? parsed.marketMedian
      : null;

    return { marketMedian, listings };
  }
}
