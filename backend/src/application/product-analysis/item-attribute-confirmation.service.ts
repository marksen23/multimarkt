import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../domain/actor-context';
import {
  canonicalAttributeKey,
  canonicalCategory,
  isWritableAttributeKey,
  normalizeConfirmedValue,
  requiredFactsFor,
} from '../../domain/category/taxonomy';
import { HumanGateBypassException } from '../../domain/errors/state-transition.errors';
import { ItemAttributeEntity } from '../../infrastructure/database/entities';

/**
 * `POST /items/:id/attributes/:key/confirm` — bewusste, dokumentierte
 * Doc-04-Erweiterung (siehe Abschlussbericht): der eingefrorene Vertrag
 * kennt nur `confirm-truth` für `condition`, aber Doc 03 §5's "Never
 * silently invent"-Prinzip gilt für JEDES Attribut, nicht nur die
 * Zustandsangabe — ohne diesen Endpoint bliebe jeder andere KI-Claim
 * (Marke, Farbe, Material, ...) für immer INFERRED, ohne dass ein Nutzer
 * ihn je bestätigen könnte. Folgt exakt demselben Human-Gate-Muster wie
 * StateGuardService.CONFIRM_TRUTH: nur Actor USER darf einen Claim zu
 * USER_CONFIRMED heben, ein AI/SYSTEM-Actor kann das strukturell nicht
 * (dieselbe Provenienz-Garantie wie bei ProductAnalysisService, nur hier
 * an der Bestätigungs- statt der Schreib-Seite durchgesetzt).
 */
@Injectable()
export class ItemAttributeConfirmationService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async confirm(
    itemId: string,
    attributeKey: string,
    value: string | undefined,
    actor: ActorContext,
  ): Promise<ItemAttributeEntity> {
    if (actor.type !== 'USER') {
      throw new HumanGateBypassException(
        `Confirming attribute '${attributeKey}' requires an authenticated USER actor (Doc 03 §5 "Never silently invent")`,
        { itemId, attributeKey, actor: actor.type },
      );
    }

    const key = canonicalAttributeKey(attributeKey) ?? attributeKey;
    const existing = await this.dataSource.manager.findOneBy(ItemAttributeEntity, {
      itemId,
      attributeKey: key,
    });

    if (!existing && !isWritableAttributeKey(key)) {
      throw new NotFoundException(`No attribute '${attributeKey}' found for item ${itemId}`);
    }

    const stored = resolveConfirmedValue(key, value, existing?.attributeValue ?? null);
    if (!stored) {
      throw new BadRequestException(
        existing
          ? `Attribute '${attributeKey}' is not a valid value`
          : `Attribute '${attributeKey}' has no value to confirm — provide one explicitly`,
      );
    }

    if (existing) {
      existing.attributeKey = key;
      existing.attributeValue = stored;
      existing.truthState = 'USER_CONFIRMED';
      existing.source = 'USER_INPUT';
      const saved = await this.dataSource.manager.save(ItemAttributeEntity, existing);
      if (key === 'category') await this.ensureRequiredFacts(itemId, stored);
      return saved;
    }

    const created = await this.dataSource.manager.save(ItemAttributeEntity, {
      itemId,
      attributeKey: key,
      attributeValue: stored,
      truthState: 'USER_CONFIRMED',
      source: 'USER_INPUT',
    });
    if (key === 'category') await this.ensureRequiredFacts(itemId, stored);
    return created;
  }

  /** Fehlende Pflichtangaben der gewählten Kategorie als Lücke anlegen. */
  private async ensureRequiredFacts(itemId: string, categoryValue: string): Promise<void> {
    const category = canonicalCategory(categoryValue);
    if (!category) return;
    const existing = await this.dataSource.manager.find(ItemAttributeEntity, { where: { itemId } });
    const present = new Set(existing.map((attribute) => attribute.attributeKey));
    for (const fact of requiredFactsFor(category)) {
      if (present.has(fact)) continue;
      await this.dataSource.manager.insert(ItemAttributeEntity, {
        itemId,
        attributeKey: fact,
        attributeValue: null,
        truthState: 'UNKNOWN',
        source: 'SCHEMA',
      });
    }
  }
}

function resolveConfirmedValue(
  key: string,
  value: string | undefined,
  current: string | null,
): string | null {
  if (value !== undefined) return normalizeConfirmedValue(key, value);
  if (!current) return null;
  if (key === 'category' || key === 'functionChecked') return normalizeConfirmedValue(key, current);
  return current;
}
