import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../domain/actor-context';
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

    const existing = await this.dataSource.manager.findOneBy(ItemAttributeEntity, {
      itemId,
      attributeKey,
    });
    if (!existing) {
      throw new NotFoundException(`No attribute '${attributeKey}' found for item ${itemId}`);
    }

    const finalValue = value ?? existing.attributeValue;
    if (!finalValue) {
      throw new BadRequestException(
        `Attribute '${attributeKey}' has no value to confirm — provide one explicitly`,
      );
    }

    existing.attributeValue = finalValue;
    existing.truthState = 'USER_CONFIRMED';
    existing.source = 'USER_INPUT';
    return this.dataSource.manager.save(ItemAttributeEntity, existing);
  }
}
