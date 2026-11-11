import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ActorContext } from '../../domain/actor-context';
import {
  AI_VISION_PROVIDER,
  AiVisionProvider,
} from '../../domain/ai/ai-vision-provider.interface';
import { TruthState } from '../../domain/state-vocabulary';
import { claimsForStorage, nextItemTitle, sanitizeVisionHint } from '../../domain/ai/vision-listing';
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
    options?: { hint?: string | null },
  ): Promise<ItemEntity> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id: itemId });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    const result = await this.runVision(imageUrls, options?.hint);
    const claims = claimsForStorage(result.attributes);

    await this.dataSource.transaction(async (manager) => {
      await this.writeClaims(manager, item, claims, result.modelId, false);
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
  async reanalyzeInPlace(itemId: string, options?: { hint?: string | null }): Promise<ItemEntity> {
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

    const result = await this.runVision(photos.map((p) => p.url), options?.hint);
    const claims = claimsForStorage(result.attributes);

    await this.dataSource.transaction(async (manager) => {
      await this.writeClaims(manager, item, claims, result.modelId, true);
    });

    return this.dataSource.manager.findOneByOrFail(ItemEntity, { id: itemId });
  }

  private async runVision(imageUrls: string[], hint?: string | null) {
    try {
      return await this.aiProvider.analyzeItem({ imageUrls, hint: sanitizeVisionHint(hint) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bildanalyse fehlgeschlagen';
      if (/GEMINI_API_KEY|Gemini hat|Gemini lehnt|Gemini-Kontingent|nicht im erwarteten Format/i.test(message)) {
        throw new ServiceUnavailableException(message);
      }
      throw new BadRequestException(message);
    }
  }

  private async writeClaims(
    manager: EntityManager,
    item: ItemEntity,
    claims: { key: string; value: string | null; confidence: number }[],
    source: string,
    respectUserConfirmed: boolean,
  ) {
    const previousTitle = await manager.findOneBy(ItemAttributeEntity, {
      itemId: item.id,
      attributeKey: 'title',
    });

    for (const claim of claims) {
      const existing = respectUserConfirmed
        ? await manager.findOneBy(ItemAttributeEntity, { itemId: item.id, attributeKey: claim.key })
        : null;
      // Echte Nutzer-Bestätigungen bleiben. `:auto` war keine: die
      // Analyse hatte hohe Konfidenz selbst auf USER_CONFIRMED gehoben
      // und danach jede Korrektur blockiert.
      if (respectUserConfirmed && keepUserConfirmed(existing)) continue;

      const { truthState } = classifyVisionClaim(claim);
      await manager.upsert(
        ItemAttributeEntity,
        {
          itemId: item.id,
          attributeKey: claim.key,
          attributeValue: truthState === 'UNKNOWN' ? null : claim.value,
          truthState,
          source,
          confidence: claim.confidence,
        },
        ['itemId', 'attributeKey'],
      );
    }

    const suggested = claims.find((claim) => claim.key === 'title')?.value ?? null;
    const next = nextItemTitle({
      current: item.title,
      previousAiTitle: previousTitle?.attributeValue ?? null,
      previousConfirmed: keepUserConfirmed(previousTitle),
      suggested,
    });
    if (next && next !== item.title) {
      await manager.update(ItemEntity, { id: item.id }, { title: next });
      item.title = next;
    }
  }
}

/**
 * KI schreibt nie USER_CONFIRMED. Hohe Konfidenz bleibt ein Vorschlag,
 * den ein Mensch in der Prüfung bestätigt (T02).
 */
export function classifyVisionClaim(claim: { key: string; value: string | null; confidence: number }): {
  truthState: TruthState;
} {
  return { truthState: claim.value ? 'INFERRED' : 'UNKNOWN' };
}

export function keepUserConfirmed(
  existing: { truthState: string; source: string | null } | null | undefined,
): boolean {
  if (!existing || existing.truthState !== 'USER_CONFIRMED') return false;
  return !existing.source?.endsWith(':auto');
}
