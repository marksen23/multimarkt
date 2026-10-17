import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  NegotiationDraft,
  NegotiationPlatform,
  suggestNegotiation,
} from '../../domain/negotiation/negotiation';
import {
  ItemEntity,
  ItemPriceResearchEntity,
} from '../../infrastructure/database/entities';
import { PriceResearchSourceResult } from '../pricing/price-triangulation.service';
import { PriceRecommendationService } from '../pricing/price-recommendation.service';

export interface NegotiationSuggestion extends NegotiationDraft {
  itemId: string;
  title: string | null;
}

/**
 * Feature-Plan 3.7. Liest die gespeicherte Preisrecherche dieses Artikels
 * (dieselbe Schmerzgrenze wie beim Nachfassen, Verkaufsziel ausgewogen)
 * und gibt nur Text zurück. Die Käufernachricht wird nicht gespeichert.
 */
@Injectable()
export class NegotiationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly priceRecommendation: PriceRecommendationService,
  ) {}

  async suggest(input: {
    userId: string;
    itemId: string;
    message: string;
    platform?: NegotiationPlatform;
  }): Promise<NegotiationSuggestion> {
    const message = input.message.trim();
    if (!message) {
      throw new BadRequestException('Die Käufernachricht fehlt.');
    }
    if (!input.userId) {
      throw new NotFoundException(`Item ${input.itemId} not found`);
    }

    const item = await this.dataSource.manager.findOneBy(ItemEntity, {
      id: input.itemId,
      userId: input.userId,
    });
    if (!item) throw new NotFoundException(`Item ${input.itemId} not found`);

    const prices = await this.prices(item.id);
    if (!prices) {
      throw new BadRequestException(
        'Für diesen Artikel fehlen Zielpreis und Schmerzgrenze. Zuerst die Preisrecherche ausführen.',
      );
    }

    const draft = suggestNegotiation({
      message,
      minPrice: prices.minPrice,
      targetPrice: prices.targetPrice,
      platform: input.platform ?? 'KLEINANZEIGEN',
    });

    return { itemId: item.id, title: item.title, ...draft };
  }

  private async prices(
    itemId: string,
  ): Promise<{ minPrice: number; targetPrice: number } | null> {
    const rows = await this.dataSource.manager.find(ItemPriceResearchEntity, {
      where: { itemId },
      order: { fetchedAt: 'DESC' },
    });
    if (rows.length === 0) return null;

    const newest = rows[0].fetchedAt.getTime();
    const sources: PriceResearchSourceResult[] = rows
      .filter((row) => row.fetchedAt.getTime() === newest)
      .map((row) => ({
        source: row.source,
        providerLabel: row.providerLabel,
        median: row.median,
        p25: row.p25,
        p75: row.p75,
        sampleSize: row.sampleSize,
        currency: row.currency,
        detail: row.rawResponse ?? undefined,
      }));

    const recommendation = this.priceRecommendation.recommend(sources, null);
    if (
      !recommendation ||
      recommendation.targetPrice <= 0 ||
      recommendation.minPrice <= 0
    ) {
      return null;
    }
    return {
      minPrice: recommendation.minPrice,
      targetPrice: recommendation.targetPrice,
    };
  }
}
