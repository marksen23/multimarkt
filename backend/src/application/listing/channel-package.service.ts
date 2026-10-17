import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ActorContext } from '../../domain/actor-context';
import { SalesGoal } from '../../domain/ai/description-generation-provider.interface';
import { ListingChannel } from '../../domain/ai/title-generation-provider.interface';
import { InvalidStateTransitionException } from '../../domain/errors/state-transition.errors';
import { ProjectionLifecycleState } from '../../domain/state-vocabulary';
import {
  CanonicalListingEntity,
  ItemEntity,
  MarketplaceProjectionEntity,
} from '../../infrastructure/database/entities';
import { PriceTriangulationService } from '../pricing/price-triangulation.service';
import { StateGuardService } from '../state-guard/state-guard.service';
import { TitleGapAnalysis, TitleTokenAnalysisService } from '../title-generation/title-token-analysis.service';
import { TitleGenerationService } from '../title-generation/title-generation.service';
import { CanonicalListingService } from './canonical-listing.service';
import { VaguePhraseDetectorService, VaguePhraseMatch } from './vague-phrase-detector.service';

/**
 * Kleinanzeigen, Vinted, eBay. Facebook gibt es nur in der Ankaufsuche,
 * nicht als Listing-Kanal — deshalb keine vierte Karte.
 * Reihenfolge ist die Anzeige-Reihenfolge.
 */
export const CHANNEL_CARD_MARKETS: ListingChannel[] = ['KLEINANZEIGEN', 'VINTED', 'EBAY'];

const EDITABLE_CARD_STATES: ReadonlySet<ProjectionLifecycleState> = new Set(['DRAFT', 'COPIED']);

export interface ChannelCardView {
  id: string | null;
  marketplaceId: ListingChannel;
  title: string;
  descriptionText: string;
  suggestedPrice: number | null;
  status: ProjectionLifecycleState | null;
  gapAnalysis: TitleGapAnalysis;
  vaguePhrases: VaguePhraseMatch[];
}

export interface ChannelPackageView {
  itemId: string;
  listingId: string | null;
  persisted: boolean;
  cards: ChannelCardView[];
}

export interface ChannelCardInput {
  marketplaceId: ListingChannel;
  title: string;
  descriptionText: string;
  suggestedPrice: number;
}

/**
 * Ein Artikel, ein Paket aus Kanal-Karten. Texte und Preisvorschläge liegen
 * auf der Projektion, nicht mehr nur einmal am Canonical Listing. Status
 * setzt der Mensch: kopiert, online, verkauft, zurückgezogen. Kein
 * Marktplatz-Adapter legt eine Anzeige an oder löscht sie.
 */
@Injectable()
export class ChannelPackageService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stateGuard: StateGuardService,
    private readonly canonicalListing: CanonicalListingService,
    private readonly titleGeneration: TitleGenerationService,
    private readonly priceTriangulation: PriceTriangulationService,
    private readonly tokenAnalysis: TitleTokenAnalysisService,
    private readonly vaguePhraseDetector: VaguePhraseDetectorService,
  ) {}

  async getPackage(
    itemId: string,
    salesGoal: SalesGoal | null,
    fresh: boolean,
  ): Promise<ChannelPackageView> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id: itemId });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    if (!fresh) {
      const saved = await this.readSaved(this.dataSource.manager, itemId);
      if (saved) return saved;
    }

    if (item.status !== 'READY' && item.status !== 'LISTED') {
      return { itemId, listingId: null, persisted: false, cards: [] };
    }

    return this.generatePreview(itemId, salesGoal);
  }

  async save(
    userId: string,
    itemId: string,
    cards: ChannelCardInput[],
    actor: ActorContext,
  ): Promise<ChannelPackageView> {
    this.assertCompleteSet(cards);

    await this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(ItemEntity, {
        where: { id: itemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException(`Item ${itemId} not found`);

      let listing = await this.findListing(manager, itemId);
      if (!listing) {
        if (item.status !== 'READY') {
          throw new InvalidStateTransitionException(
            'Kanal-Karten lassen sich nur aus einem bereiten Artikel anlegen.',
            { itemId, currentState: item.status },
          );
        }
        const primary = cards.find((card) => card.marketplaceId === 'KLEINANZEIGEN') ?? cards[0];
        listing = await manager.save(CanonicalListingEntity, {
          userId,
          itemId,
          bundleId: null,
          sellingPrice: primary.suggestedPrice,
          descriptionText: item.title?.trim() || primary.title,
        });
        await this.stateGuard.transitionItemWithManager(manager, itemId, {
          type: 'START_LISTING',
          actor,
        });
      }

      const existing = await manager.find(MarketplaceProjectionEntity, {
        where: { canonicalListingId: listing.id },
      });

      for (const card of cards) {
        const projection = existing.find((row) => row.marketplaceId === card.marketplaceId);
        if (!projection) {
          await manager.save(MarketplaceProjectionEntity, {
            canonicalListingId: listing.id,
            marketplaceId: card.marketplaceId,
            status: 'DRAFT',
            title: card.title,
            descriptionText: card.descriptionText,
            suggestedPrice: card.suggestedPrice,
          });
          continue;
        }
        if (!EDITABLE_CARD_STATES.has(projection.status)) continue;
        projection.title = card.title;
        projection.descriptionText = card.descriptionText;
        projection.suggestedPrice = card.suggestedPrice;
        await manager.save(MarketplaceProjectionEntity, projection);
      }
    });

    const saved = await this.readSaved(this.dataSource.manager, itemId);
    if (!saved) throw new NotFoundException(`Channel package for item ${itemId} was not stored`);
    return saved;
  }

  /** Entwurf → kopiert. Kein Publish, kein Adapter. */
  async markCopied(projectionId: string, actor: ActorContext): Promise<MarketplaceProjectionEntity> {
    const projection = await this.requireProjection(projectionId);
    if (projection.status === 'COPIED') return projection;
    return this.stateGuard.transitionProjection(projectionId, { type: 'MARK_COPIED', actor });
  }

  /** kopiert → online. Der Mensch bestätigt, dass die Anzeige selbst eingestellt ist. */
  async confirmOnline(projectionId: string, actor: ActorContext): Promise<MarketplaceProjectionEntity> {
    return this.stateGuard.transitionProjection(projectionId, { type: 'CONFIRM_ONLINE', actor });
  }

  private assertCompleteSet(cards: ChannelCardInput[]): void {
    const ids = new Set(cards.map((card) => card.marketplaceId));
    const missing = CHANNEL_CARD_MARKETS.filter((channel) => !ids.has(channel));
    if (missing.length > 0 || ids.size !== CHANNEL_CARD_MARKETS.length) {
      throw new BadRequestException(
        'Das Paket braucht je eine Karte für Kleinanzeigen, Vinted und eBay.',
      );
    }
  }

  private async generatePreview(itemId: string, salesGoal: SalesGoal | null): Promise<ChannelPackageView> {
    const suggestedPrice = await this.suggestPrice(itemId, salesGoal);
    const listing = await this.findListing(this.dataSource.manager, itemId);
    const cards = await Promise.all(
      CHANNEL_CARD_MARKETS.map(async (channel) => {
        const [title, description] = await Promise.all([
          this.titleGeneration.generateTitle(itemId, channel),
          this.canonicalListing.generateDescription(itemId, salesGoal, channel),
        ]);
        return {
          id: null,
          marketplaceId: channel,
          title: title.title,
          descriptionText: description.descriptionText,
          suggestedPrice,
          status: null,
          gapAnalysis: description.gapAnalysis,
          vaguePhrases: description.vaguePhrases,
        } satisfies ChannelCardView;
      }),
    );
    return { itemId, listingId: listing?.id ?? null, persisted: false, cards };
  }

  private async suggestPrice(itemId: string, salesGoal: SalesGoal | null): Promise<number | null> {
    try {
      const research = await this.priceTriangulation.research(itemId, { salesGoal });
      if (research.recommendation) return research.recommendation.listPrice;
      const medians = research.sources
        .map((source) => source.median)
        .filter((median): median is number => median !== null);
      if (medians.length === 0) return null;
      const average = medians.reduce((sum, value) => sum + value, 0) / medians.length;
      return Math.round(average * 100) / 100;
    } catch {
      return null;
    }
  }

  private async readSaved(manager: EntityManager, itemId: string): Promise<ChannelPackageView | null> {
    const listing = await this.findListing(manager, itemId);
    if (!listing) return null;

    const projections = await manager.find(MarketplaceProjectionEntity, {
      where: { canonicalListingId: listing.id },
    });
    const byMarket = new Map(projections.map((row) => [row.marketplaceId, row]));
    if (!CHANNEL_CARD_MARKETS.some((channel) => byMarket.has(channel))) return null;

    const cards = await Promise.all(
      CHANNEL_CARD_MARKETS.map(async (channel) => {
        const projection = byMarket.get(channel);
        if (!projection) {
          return {
            id: null,
            marketplaceId: channel,
            title: '',
            descriptionText: '',
            suggestedPrice: null,
            status: null,
            gapAnalysis: { ownTokens: [], missingTokens: [] },
            vaguePhrases: [],
          } satisfies ChannelCardView;
        }
        const descriptionText = projection.descriptionText ?? '';
        const analysis = await this.analyzeStoredText(itemId, descriptionText);
        return {
          id: projection.id,
          marketplaceId: channel,
          title: projection.title ?? '',
          descriptionText,
          suggestedPrice: projection.suggestedPrice,
          status: projection.status,
          gapAnalysis: analysis.gapAnalysis,
          vaguePhrases: analysis.vaguePhrases,
        } satisfies ChannelCardView;
      }),
    );

    return {
      itemId,
      listingId: listing.id,
      persisted: cards.every((card) => card.id !== null),
      cards,
    };
  }

  private async analyzeStoredText(
    itemId: string,
    descriptionText: string,
  ): Promise<{ gapAnalysis: TitleGapAnalysis; vaguePhrases: VaguePhraseMatch[] }> {
    let comparableListings: { title: string; price: number }[] = [];
    try {
      const research = await this.priceTriangulation.research(itemId);
      comparableListings = research.sources.flatMap((source) => {
        const listings = source.detail?.comparableListings;
        return Array.isArray(listings) ? (listings as { title: string; price: number }[]) : [];
      });
    } catch {
      comparableListings = [];
    }
    return {
      gapAnalysis: this.tokenAnalysis.analyze(descriptionText, comparableListings),
      vaguePhrases: this.vaguePhraseDetector.detect(descriptionText),
    };
  }

  private findListing(manager: EntityManager, itemId: string): Promise<CanonicalListingEntity | null> {
    return manager.findOne(CanonicalListingEntity, {
      where: { itemId },
      order: { createdAt: 'DESC' },
    });
  }

  private async requireProjection(projectionId: string): Promise<MarketplaceProjectionEntity> {
    const projection = await this.dataSource.manager.findOneBy(MarketplaceProjectionEntity, {
      id: projectionId,
    });
    if (!projection) throw new NotFoundException(`Listing ${projectionId} not found`);
    return projection;
  }
}
