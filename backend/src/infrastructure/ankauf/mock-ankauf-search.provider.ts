import { Injectable } from '@nestjs/common';
import type {
  AnkaufSearchProvider,
  AnkaufSearchProviderResult,
  AnkaufSearchQuery,
} from '../../domain/ankauf/ankauf-search-provider.interface';

@Injectable()
export class MockAnkaufSearchProvider implements AnkaufSearchProvider {
  async search(query: AnkaufSearchQuery): Promise<AnkaufSearchProviderResult> {
    const kw = query.keywords.trim();
    return {
      marketMedian: 65,
      listings: [
        {
          title: `${kw} — wie neu, kaum getragen`,
          price: 55,
          platform: 'KLEINANZEIGEN',
          url: 'https://www.kleinanzeigen.de/s-anzeige/example/1234567890',
          condition: 'Wie neu',
        },
        {
          title: `${kw} — sehr guter Zustand`,
          price: 48,
          platform: 'VINTED',
          url: 'https://www.vinted.de/items/1234567',
          condition: 'Sehr guter Zustand',
        },
        {
          title: `${kw} TOP Zustand mit OVP`,
          price: 72,
          platform: 'EBAY',
          url: 'https://www.ebay.de/itm/123456789012',
          condition: 'Sehr gut',
        },
        {
          title: `${kw} gebraucht, ein paar Kratzer`,
          price: 35,
          platform: 'KLEINANZEIGEN',
          url: 'https://www.kleinanzeigen.de/s-anzeige/example/9876543210',
          condition: 'Gebraucht — kleine Kratzer an der Sohle',
        },
        {
          title: `${kw} Gr. 42 Berlin Mitte`,
          price: 60,
          platform: 'FACEBOOK',
          url: null,
          condition: 'Guter Zustand',
        },
        {
          title: `${kw} original, Rechnung vorhanden`,
          price: 89,
          platform: 'EBAY',
          url: 'https://www.ebay.de/itm/987654321098',
          condition: 'Wie neu, mit Originalrechnung',
        },
        {
          title: `${kw} Schnäppchen! Defekt (Sohle löst sich)`,
          price: 15,
          platform: 'KLEINANZEIGEN',
          url: 'https://www.kleinanzeigen.de/s-anzeige/example/1111111111',
          condition: 'Defekt — Sohle löst sich',
        },
        {
          title: `${kw} guter Zustand, kein Tausch`,
          price: 58,
          platform: 'VINTED',
          url: 'https://www.vinted.de/items/7654321',
          condition: 'Gut',
        },
      ],
    };
  }
}
