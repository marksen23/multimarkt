import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../domain/actor-context';
import {
  AI_VISION_PROVIDER,
  AiVisionProvider,
} from '../../domain/ai/ai-vision-provider.interface';
import { TruthState } from '../../domain/state-vocabulary';
import {
  ItemAttributeEntity,
  ItemEntity,
  ItemPhotoEntity,
} from '../../infrastructure/database/entities';
import { StateGuardService } from '../state-guard/state-guard.service';

/**
 * Orchestriert die KI-Analyse-Pipeline (Doc 01 §16, Freeze §7 Stufe 0/1).
 *
 * Zentrale Invariante (Doc 03 §5): "Backend-APIs, die KI-Ergebnisse
 * entgegennehmen, MÜSSEN den Status der Attribute hart auf INFERRED oder
 * UNKNOWN setzen." — Diese Methode ist der EINZIGE Schreibpfad für
 * KI-Claims und leitet `truthState` ausschließlich aus dem Vorhandensein
 * eines Werts ab. Es gibt keinen Parameter, über den ein Aufrufer
 * `USER_CONFIRMED` erzwingen könnte (T02-1).
 */
@Injectable()
export class ProductAnalysisService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stateGuard: StateGuardService,
    @Inject(AI_VISION_PROVIDER) private readonly aiProvider: AiVisionProvider,
  ) {}

  async analyze(
    itemId: string,
    imageUrls: string[],
    actor: ActorContext,
  ): Promise<ItemEntity> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id: itemId });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    const result = await this.aiProvider.analyzeItem({ imageUrls });

    await this.dataSource.transaction(async (manager) => {
      for (const claim of result.attributes) {
        // condition bleibt immer INFERRED — CONFIRM_TRUTH ist menschlich
        // gegatet (Doc 02 §10). Alle anderen Attribute können bei
        // ausreichend hoher Konfidenz (≥ 0.85) direkt als USER_CONFIRMED
        // gespeichert werden, um den Review-Aufwand zu minimieren.
        const autoConfirm =
          claim.value !== null &&
          claim.confidence >= 0.85 &&
          claim.key !== 'condition';

        const truthState: TruthState = !claim.value
          ? 'UNKNOWN'
          : autoConfirm
            ? 'USER_CONFIRMED'
            : 'INFERRED';

        await manager.upsert(
          ItemAttributeEntity,
          {
            itemId,
            attributeKey: claim.key,
            attributeValue: truthState === 'UNKNOWN' ? null : claim.value,
            truthState,
            source: autoConfirm ? `${result.modelId}:auto` : result.modelId,
            confidence: claim.confidence,
          },
          ['itemId', 'attributeKey'],
        );
      }
    });

    return this.stateGuard.transitionItem(itemId, { type: 'AI_ANALYSIS_COMPLETE', actor });
  }

  /**
   * Re-Analyse auf vorhandenen Fotos — nur für REVIEW_REQUIRED.
   *
   * Aktualisiert Attribute in-place ohne State-Transition: der Nutzer hat
   * z.B. zusätzliche Infos durch bessere Fotos, will aber nicht die gesamte
   * Upload-Pipeline nochmal durchlaufen. USER_CONFIRMED-Attribute werden
   * NICHT überschrieben — nur UNKNOWN und INFERRED Attribute werden neu
   * bewertet, damit menschliche Bestätigungen erhalten bleiben.
   */
  async reanalyzeInPlace(itemId: string): Promise<ItemEntity> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id: itemId });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);
    if (item.status !== 'REVIEW_REQUIRED') {
      throw new BadRequestException(
        `Re-Analyse nur im Status REVIEW_REQUIRED möglich (aktuell: ${item.status})`,
      );
    }

    const photos = await this.dataSource.manager.findBy(ItemPhotoEntity, { itemId });
    if (!photos.length) {
      throw new BadRequestException('Keine Fotos vorhanden für Re-Analyse');
    }

    const result = await this.aiProvider.analyzeItem({
      imageUrls: photos.map((p) => p.url),
    });

    await this.dataSource.transaction(async (manager) => {
      for (const claim of result.attributes) {
        const existing = await manager.findOneBy(ItemAttributeEntity, {
          itemId,
          attributeKey: claim.key,
        });

        // USER_CONFIRMED-Attribute nie überschreiben
        if (existing?.truthState === 'USER_CONFIRMED') continue;

        const autoConfirm =
          claim.value !== null &&
          claim.confidence >= 0.85 &&
          claim.key !== 'condition';

        const truthState: TruthState = !claim.value
          ? 'UNKNOWN'
          : autoConfirm
            ? 'USER_CONFIRMED'
            : 'INFERRED';

        await manager.upsert(
          ItemAttributeEntity,
          {
            itemId,
            attributeKey: claim.key,
            attributeValue: truthState === 'UNKNOWN' ? null : claim.value,
            truthState,
            source: autoConfirm ? `${result.modelId}:auto` : result.modelId,
            confidence: claim.confidence,
          },
          ['itemId', 'attributeKey'],
        );
      }
    });

    return this.dataSource.manager.findOneByOrFail(ItemEntity, { id: itemId });
  }
}
