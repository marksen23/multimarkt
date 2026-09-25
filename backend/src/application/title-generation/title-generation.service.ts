import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ComparableListingRef } from '../../domain/ai/description-generation-provider.interface';
import {
  ListingChannel,
  TITLE_GENERATION_PROVIDER,
  TitleGenerationProvider,
} from '../../domain/ai/title-generation-provider.interface';
import { ItemAttributeEntity, ItemEntity } from '../../infrastructure/database/entities';
import { PriceTriangulationService } from '../pricing/price-triangulation.service';
import { TitleGapAnalysis, TitleTokenAnalysisService } from './title-token-analysis.service';

export interface TitleSuggestion {
  title: string;
  gapAnalysis: TitleGapAnalysis;
}

/**
 * §9e-Ergänzung (September 2026, Antwort auf die Methodik-Anfrage zu
 * verkaufsziel-optimierten Angebotstexten). Spiegelt exakt das Muster von
 * CanonicalListingService.generateDescription: bleibt ein VORSCHLAG, nie
 * eine automatische Übernahme — der Aufrufer zeigt Titel + Lückenanalyse
 * an, der Mensch entscheidet.
 */
@Injectable()
export class TitleGenerationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(TITLE_GENERATION_PROVIDER) private readonly provider: TitleGenerationProvider,
    private readonly priceTriangulation: PriceTriangulationService,
    private readonly tokenAnalysis: TitleTokenAnalysisService,
  ) {}

  async generateTitle(itemId: string, channel: ListingChannel): Promise<TitleSuggestion> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id: itemId });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    const attributes = await this.dataSource.manager.find(ItemAttributeEntity, { where: { itemId } });
    const comparableListings = await this.fetchComparableListings(itemId);
    const gapAnalysis = this.tokenAnalysis.analyze(item.title, comparableListings);

    const suggestion = await this.provider.generate({
      title: item.title,
      condition: item.condition,
      attributes: attributes.map((a) => ({ key: a.attributeKey, value: a.attributeValue })),
      channel,
      comparableListings,
    });

    return {
      title: suggestion ?? item.title ?? 'Artikel',
      gapAnalysis,
    };
  }

  /** Siehe CanonicalListingService.fetchComparableListings — dieselbe, bewusst nie hart fehlschlagende Logik. */
  private async fetchComparableListings(itemId: string): Promise<ComparableListingRef[]> {
    try {
      const research = await this.priceTriangulation.research(itemId);
      return research.sources.flatMap((source) => {
        const listings = source.detail?.comparableListings;
        return Array.isArray(listings) ? (listings as ComparableListingRef[]) : [];
      });
    } catch {
      return [];
    }
  }
}
