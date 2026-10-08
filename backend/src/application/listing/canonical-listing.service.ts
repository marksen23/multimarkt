import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../domain/actor-context';
import {
  ComparableListingRef,
  DESCRIPTION_GENERATION_PROVIDER,
  DescriptionChannel,
  DescriptionGenerationProvider,
  SalesGoal,
} from '../../domain/ai/description-generation-provider.interface';
import { InvalidStateTransitionException } from '../../domain/errors/state-transition.errors';
import {
  BundleEntity,
  CanonicalListingEntity,
  ItemAttributeEntity,
  ItemEntity,
} from '../../infrastructure/database/entities';
import { PriceTriangulationService } from '../pricing/price-triangulation.service';
import { StateGuardService } from '../state-guard/state-guard.service';
import { TitleGapAnalysis, TitleTokenAnalysisService } from '../title-generation/title-token-analysis.service';
import { VaguePhraseDetectorService, VaguePhraseMatch } from './vague-phrase-detector.service';
import {
  DescriptionQualityResult,
  DescriptionQualityService,
} from './description-quality.service';
import {
  PriceDescriptionAlignment,
  PriceDescriptionAlignmentService,
} from './price-description-alignment.service';

export interface DescriptionSuggestion {
  descriptionText: string;
  /**
   * §9e-Erweiterung (September 2026): dieselbe deterministische Token-Lückenanalyse
   * wie beim Titel (TitleTokenAnalysisService), hier auf den Beschreibungstext angewendet.
   */
  gapAnalysis: TitleGapAnalysis;
  /** Bekannte Floskeln im generierten Text, mit Vorschlag zur Konkretisierung. */
  vaguePhrases: VaguePhraseMatch[];
  /** Oktober 2026: Qualitätsbewertung (Vollständigkeit, Konditions-Sprache, Kontaktdaten). */
  quality: DescriptionQualityResult;
  /**
   * Oktober 2026: Preisbindungs-Alignment — passt die Beschreibungssprache zum Preispunkt?
   * Null wenn keine Marktpreisdaten vorhanden.
   */
  priceAlignment: PriceDescriptionAlignment | null;
}

/**
 * `POST /items/:id/prepare-listing` / `POST /bundles/:id/prepare-listing`
 * (Doc 04 §7/§10): leitet das Canonical Listing ab (Doc 01 §3, Doc 04 "Product
 * → Listing"). Doc 04 §20 listet dafür keinen eigenen Item-Zielzustand, aber
 * Doc 02 §4 kennt `READY --(Listing Start)--> LISTED` — dieser Service ist
 * der Moment, an dem der Nutzer sich verbindlich zum Verkauf entscheidet,
 * daher wird hier genau diese Transition ausgelöst (Human-Gate).
 */
@Injectable()
export class CanonicalListingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stateGuard: StateGuardService,
    @Inject(DESCRIPTION_GENERATION_PROVIDER)
    private readonly descriptionProvider: DescriptionGenerationProvider,
    private readonly priceTriangulation: PriceTriangulationService,
    private readonly tokenAnalysis: TitleTokenAnalysisService,
    private readonly vaguePhraseDetector: VaguePhraseDetectorService,
    private readonly descriptionQuality: DescriptionQualityService,
    private readonly priceAlignment: PriceDescriptionAlignmentService,
  ) {}

  /**
   * §9b/§9e: Vorschau-Vorschlag, den das Frontend VOR dem Speichern in ein
   * editierbares Feld füllt — kein automatischer Save.
   *
   * `salesGoal` steuert den TON, `channel` steuert Länge/Struktur für die
   * Zielplattform (Kleinanzeigen/eBay/Vinted). Vergleichsangebote kommen aus
   * derselben Gemini-Grounding-Preisrecherche (§9e) — keine zusätzliche Recherche.
   *
   * Oktober 2026: Liefert zusätzlich `quality` (Beschreibungsqualitätsscore)
   * und `priceAlignment` (Preisbindungs-Alignment) als Teil der Antwort.
   */
  async generateDescription(
    itemId: string,
    salesGoal: SalesGoal | null = null,
    channel: DescriptionChannel | null = null,
  ): Promise<DescriptionSuggestion> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id: itemId });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    const attributes = await this.dataSource.manager.find(ItemAttributeEntity, {
      where: { itemId },
    });

    const { comparableListings, priceResearchResult } = await this.fetchPriceResearchData(itemId);

    const descriptionText = await this.suggestDescription(
      item.title,
      item.condition,
      attributes,
      comparableListings,
      salesGoal,
      channel,
    );

    const quality = this.descriptionQuality.evaluate(descriptionText, item.condition, attributes);

    const vaguePhrases = this.vaguePhraseDetector.detect(descriptionText);

    // Vague phrases fließen als zusätzlicher Deduction in den Quality-Score ein
    // (hier nicht noch mal als eigene Issue — vaguePhrases im Response reichen)
    const adjustedQualityScore = Math.max(0, quality.score - vaguePhrases.length * 5);
    const qualityWithVagueDeduction: DescriptionQualityResult = {
      ...quality,
      score: adjustedQualityScore,
    };

    const alignment =
      priceResearchResult?.recommendation
        ? this.priceAlignment.evaluate(
            descriptionText,
            priceResearchResult.recommendation,
            priceResearchResult.sources,
            item.condition,
          )
        : null;

    return {
      descriptionText,
      gapAnalysis: this.tokenAnalysis.analyze(descriptionText, comparableListings),
      vaguePhrases,
      quality: qualityWithVagueDeduction,
      priceAlignment: alignment,
    };
  }

  async prepareForItem(
    userId: string,
    itemId: string,
    sellingPrice: number,
    descriptionText: string | undefined,
    actor: ActorContext,
  ): Promise<CanonicalListingEntity> {
    return this.dataSource.transaction(async (manager) => {
      const item = await manager.findOneBy(ItemEntity, { id: itemId });
      if (!item) throw new NotFoundException(`Item ${itemId} not found`);

      if (item.status !== 'READY') {
        throw new InvalidStateTransitionException(
          `Item must be READY to prepare a listing (current: ${item.status})`,
          { itemId, currentState: item.status },
        );
      }

      const finalDescription =
        descriptionText ??
        (await this.suggestDescription(
          item.title,
          item.condition,
          await manager.find(ItemAttributeEntity, { where: { itemId } }),
          (await this.fetchPriceResearchData(itemId)).comparableListings,
          null,
          null,
        ));

      const listing = await manager.save(CanonicalListingEntity, {
        userId,
        itemId,
        bundleId: null,
        sellingPrice,
        descriptionText: finalDescription,
      });

      await this.stateGuard.transitionItemWithManager(manager, itemId, {
        type: 'START_LISTING',
        actor,
      });

      return listing;
    });
  }

  async prepareForBundle(
    userId: string,
    bundleId: string,
    sellingPrice: number,
    descriptionText: string,
    actor: ActorContext,
  ): Promise<CanonicalListingEntity> {
    return this.dataSource.transaction(async (manager) => {
      const bundle = await manager.findOneBy(BundleEntity, { id: bundleId });
      if (!bundle) throw new NotFoundException(`Bundle ${bundleId} not found`);

      if (bundle.status !== 'READY') {
        throw new InvalidStateTransitionException(
          `Bundle must be READY to prepare a listing (current: ${bundle.status})`,
          { bundleId, currentState: bundle.status },
        );
      }

      const listing = await manager.save(CanonicalListingEntity, {
        userId,
        itemId: null,
        bundleId,
        sellingPrice,
        descriptionText,
      });

      await this.stateGuard.transitionBundleWithManager(manager, bundleId, {
        type: 'START_LISTING',
        actor,
      });

      return listing;
    });
  }

  private async suggestDescription(
    title: string | null,
    condition: string | null,
    attributes: ItemAttributeEntity[],
    comparableListings: ComparableListingRef[],
    salesGoal: SalesGoal | null,
    channel: DescriptionChannel | null,
  ): Promise<string> {
    const suggestion = await this.descriptionProvider.generate({
      title,
      condition,
      attributes: attributes.map((a) => ({ key: a.attributeKey, value: a.attributeValue })),
      comparableListings,
      salesGoal,
      channel: channel ?? undefined,
    });
    return suggestion ?? `${title ?? 'Artikel'} — Zustand: ${condition ?? 'unbekannt'}`;
  }

  /**
   * Holt Preisrecherche-Daten inkl. Vergleichsangebote. Schlägt niemals hart
   * fehl — die Beschreibung bleibt auch ohne Preisdaten nutzbar.
   */
  private async fetchPriceResearchData(itemId: string): Promise<{
    comparableListings: ComparableListingRef[];
    priceResearchResult: Awaited<ReturnType<PriceTriangulationService['research']>> | null;
  }> {
    try {
      const research = await this.priceTriangulation.research(itemId);
      const comparableListings = research.sources.flatMap((source) => {
        const listings = source.detail?.comparableListings;
        return Array.isArray(listings) ? (listings as ComparableListingRef[]) : [];
      });
      return { comparableListings, priceResearchResult: research };
    } catch {
      return { comparableListings: [], priceResearchResult: null };
    }
  }
}
