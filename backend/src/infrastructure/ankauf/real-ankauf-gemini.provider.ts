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
Suche über Google nach AKTUELLEN Privatverkauf-Angeboten für: "${query.keywords}" im Raum ${query.location}, Deutschland.
Durchsuche Kleinanzeigen.de, eBay.de, Vinted.de und Facebook Marketplace.

Antworte AUSSCHLIESSLICH mit validem JSON, kein Markdown, kein Erklärtext:
{
  "marketMedian": <fairer Marktpreis in EUR als Zahl oder null>,
  "listings": [
    {
      "title": "<exakter Anzeigentitel>",
      "price": <Preis als Zahl in EUR>,
      "platform": "<Kleinanzeigen|eBay|Vinted|Facebook|Sonstige>",
      "url": "<direkte Anzeigen-URL als String oder null>,
      "condition": "<Zustandsbeschreibung aus der Anzeige als String oder null>"
    }
  ]
}

Regeln:
- Gib bis zu 12 aktuelle Listings zurück.
- Erfinde KEINE URLs, Preise oder Titel — nur belegte Suchergebnisse.
- marketMedian: Schätze den fairen Marktpreis für diesen Artikel im beschriebenen Zustand auf Basis der Suchergebnisse, oder null wenn keine Datenbasis.
- Preis immer als Zahl (keine Einheit, kein "€").`;
  }

  private parseResponse(text: string | undefined): AnkaufSearchProviderResult | null {
    if (!text) return null;

    let parsed: { marketMedian?: number | null; listings?: unknown[] };
    try {
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch (error) {
      this.logger.error(`Could not parse Ankauf Gemini output: ${(error as Error).message}`);
      return null;
    }

    if (!Array.isArray(parsed.listings)) return null;

    const listings: RawAnkaufListing[] = [];
    for (const raw of parsed.listings) {
      if (typeof raw !== 'object' || raw === null) continue;
      const item = raw as Record<string, unknown>;
      const price = Number(item['price']);
      if (!isNaN(price) && price > 0 && typeof item['title'] === 'string') {
        listings.push({
          title: item['title'],
          price,
          platform: normalizePlatform(String(item['platform'] ?? '')),
          url: typeof item['url'] === 'string' ? item['url'] : null,
          condition: typeof item['condition'] === 'string' ? item['condition'] : null,
        });
      }
    }

    return {
      marketMedian: typeof parsed.marketMedian === 'number' ? parsed.marketMedian : null,
      listings,
    };
  }
}
