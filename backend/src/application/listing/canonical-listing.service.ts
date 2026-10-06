import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../domain/actor-context';
import {
  ComparableListingRef,
  DESCRIPTION_GENERATION_PROVIDER,
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
import { ListingChannel } from '../../domain/ai/title-generation-provider.interface';
import { finalizeChannelDescription } from '../../domain/listing/channel-description';
import { VaguePhraseDetectorService, VaguePhraseMatch } from './vague-phrase-detector.service';

export interface DescriptionSuggestion {
  descriptionText: string;
  /**
   * §9e-Erweiterung (September 2026, "Konkurrenzanalyse vertiefen"):
   * dieselbe deterministische Token-Lückenanalyse wie beim Titel
   * (TitleTokenAnalysisService), hier auf den Beschreibungstext angewendet
   * — echte Vergleichstitel, keine Erfindung.
   */
  gapAnalysis: TitleGapAnalysis;
  /** Bekannte Floskeln im generierten Text, mit Vorschlag zur Konkretisierung. */
  vaguePhrases: VaguePhraseMatch[];
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
  ) {}

  /**
   * §9b/§9e: Vorschau-Vorschlag, den das Frontend VOR dem Speichern in ein
   * editierbares Feld füllt — kein automatischer Save. Getrennt von
   * `prepareForItem`, damit der Nutzer den Text sehen/ändern kann, bevor er
   * sich verbindlich zum Verkauf entscheidet (dieselbe START_LISTING-
   * Transition unten).
   *
   * `salesGoal` steuert nur den TON (siehe RealGeminiDescriptionProvider),
   * nie die Fakten. Vergleichsangebote kommen aus derselben
   * Gemini-Grounding-Preisrecherche, die für die Preisvorschläge ohnehin
   * schon läuft (§9e) — keine zusätzliche Recherche nötig.
   */
  async generateDescription(
    itemId: string,
    salesGoal: SalesGoal | null = null,
    channel: ListingChannel | null = null,
  ): Promise<DescriptionSuggestion> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id: itemId });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    const attributes = await this.dataSource.manager.find(ItemAttributeEntity, {
      where: { itemId },
    });
    const comparableListings = await this.fetchComparableListings(itemId);
    const missingTokens = this.tokenAnalysis.analyze(item.title, comparableListings).missingTokens;

    const descriptionText = await this.suggestDescription(
      item.title,
      item.condition,
      attributes,
      comparableListings,
      salesGoal,
      channel,
      missingTokens,
    );

    return {
      descriptionText,
      gapAnalysis: this.tokenAnalysis.analyze(descriptionText, comparableListings),
      vaguePhrases: this.vaguePhraseDetector.detect(descriptionText),
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
          await this.fetchComparableListings(itemId),
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
    channel: ListingChannel | null = null,
    missingTokens: string[] = [],
  ): Promise<string> {
    const mappedAttributes = attributes.map((a) => ({ key: a.attributeKey, value: a.attributeValue }));
    const suggestion = await this.descriptionProvider.generate({
      title,
      condition,
      attributes: mappedAttributes,
      comparableListings,
      salesGoal,
      channel,
      missingTokens,
    });
    if (channel) {
      return finalizeChannelDescription(channel, suggestion, {
        title,
        condition,
        attributes: mappedAttributes,
        missingTokens,
      });
    }
    // Provider liefert `null`, wenn keine Generierung möglich war (z.B.
    // Gemini-Antwort leer) — nie einen kaputten/leeren Text durchreichen.
    return suggestion ?? `${title ?? 'Artikel'} — Zustand: ${condition ?? 'unbekannt'}`;
  }

  /**
   * Reine Bequemlichkeit, kein Pflichtdatensatz: schlägt fehl (fehlende
   * Attribute, Preisrecherche-Fehler) niemals hart — die Beschreibung
   * bleibt auch ohne Vergleichsangebote nutzbar, nur ohne den
   * Formulierungs-Kontext aus §9e.
   */
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
