import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  CanonicalListingEntity,
  ItemEntity,
  MarketplaceProjectionEntity,
  SaleEventEntity,
} from '../../infrastructure/database/entities';
import { StateGuardService } from '../state-guard/state-guard.service';

export interface ReportSaleInput {
  projectionId: string;
  externalEventId: string;
  reportedPrice: number;
  reportedAt?: Date;
}

export type ReportSaleOutcome = 'RECORDED' | 'IGNORED_DUPLICATE';
export type EvaluateSaleOutcome = 'SOLD' | 'CONFLICT' | 'ALREADY_RESOLVED' | 'NO_REPORTS';

/**
 * Sale Event Ingestion & Resolution (Doc 02 §7/§8, Doc 03 §8/§9/§12/§13 — T05).
 *
 * BEWUSST ZWEIPHASIG — das ist keine Vereinfachung, sondern notwendig für
 * Korrektheit: Ein Row-Lock allein serialisiert zwei nahezu gleichzeitige
 * Webhooks zwar (Doc 03 §9), löst aber NICHT das eigentliche Problem. Würde
 * `reportSale` synchron sofort entscheiden, gewinnt strukturell IMMER der
 * Webhook, der zufällig zuerst den Lock bekommt — genau das verbietet
 * Doc 05 T05-1 explizit ("Keines der Events gewinnt das Race... Endzustand:
 * SALE_CONFLICT"). Die einzige korrekte Lösung ist, die Entscheidung von der
 * Erfassung zu entkoppeln:
 *
 * 1. `reportSale()` — schnell, synchron, rein Postgres. Fügt den Sale-Event
 *    idempotent ein (`ON CONFLICT DO NOTHING`, Doc 03 §13) und entscheidet
 *    NICHTS. Wird vom Webhook-Receiver aufgerufen (Schritt 5), der direkt
 *    danach einen verzögerten BullMQ-Job für `evaluateItemSaleOutcome`
 *    einplant (Debounce-Fenster, damit nahezu gleichzeitige Reports beide
 *    Zeit haben zu landen, bevor entschieden wird) — die Queue-Anbindung
 *    selbst ist bewusst Schritt-5-Scope (Webhooks/Async Jobs), damit dieser
 *    Service unabhängig von Redis allein gegen Testcontainers-Postgres
 *    beweisbar bleibt.
 * 2. `evaluateItemSaleOutcome()` — läuft NACH dem Debounce-Fenster (oder
 *    direkt im Test). Lockt das Item, zählt ALLE jemals für dieses Item
 *    erfassten Sale-Events (nicht nur unentschiedene) und entscheidet
 *    deterministisch: genau 1 -> SOLD, mehr als 1 -> SALE_CONFLICT.
 *    Idempotent: ist das Item bereits nicht mehr LISTED (z.B. weil eine
 *    frühere Auswertung schon entschieden hat), passiert nichts.
 */
@Injectable()
export class SaleIngestionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stateGuard: StateGuardService,
  ) {}

  async reportSale(input: ReportSaleInput): Promise<ReportSaleOutcome> {
    const insertResult = await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(SaleEventEntity)
      .values({
        projectionId: input.projectionId,
        externalEventId: input.externalEventId,
        reportedPrice: input.reportedPrice,
        reportedAt: input.reportedAt ?? new Date(),
      })
      .orIgnore()
      .returning('id')
      .execute();

    return insertResult.identifiers.length === 0 ? 'IGNORED_DUPLICATE' : 'RECORDED';
  }

  async evaluateItemSaleOutcome(itemId: string): Promise<EvaluateSaleOutcome> {
    return this.dataSource.transaction(async (manager) => {
      // Lock ZUERST auf dem Item (Doc 03 §9) — serialisiert parallele
      // Auswertungsläufe für dasselbe Item vollständig.
      const item = await manager.findOne(ItemEntity, {
        where: { id: itemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException(`Item ${itemId} not found`);

      // Idempotenz: wurde dieses Item bereits (von einem früheren
      // Auswertungslauf) entschieden, ist jeder weitere Lauf ein No-Op.
      if (item.status !== 'LISTED') {
        return 'ALREADY_RESOLVED';
      }

      const reports = await this.loadOpenReportsForItem(manager, itemId);
      if (reports.length === 0) return 'NO_REPORTS';

      if (reports.length === 1) {
        await manager.update(SaleEventEntity, { id: reports[0].id }, { isWinner: true });
        await this.stateGuard.transitionItemWithManager(manager, itemId, {
          type: 'SALE_CONFIRMED_SINGLE',
          actor: { type: 'SYSTEM' },
        });
        await this.stateGuard.transitionProjectionWithManager(
          manager,
          reports[0].projectionId,
          { type: 'SOLD_HERE', actor: { type: 'SYSTEM' } },
        );
        return 'SOLD';
      }

      // Mehr als ein Report für dasselbe Item, während es noch LISTED war
      // -> deterministischer Konflikt (Doc 02 §8 Punkt 1). Alle Reports
      // bleiben unentschieden (isWinner NULL), bis ein USER-Actor
      // resolve-conflict aufruft (Doc 04 §13.1, Schritt 5).
      await this.stateGuard.transitionItemWithManager(manager, itemId, {
        type: 'SALE_CONFLICT_DETECTED',
        actor: { type: 'SYSTEM' },
      });
      return 'CONFLICT';
    });
  }

  private async loadOpenReportsForItem(
    manager: EntityManager,
    itemId: string,
  ): Promise<SaleEventEntity[]> {
    return manager
      .createQueryBuilder(SaleEventEntity, 'se')
      .innerJoin(MarketplaceProjectionEntity, 'p', 'p.id = se.projection_id')
      .innerJoin(CanonicalListingEntity, 'l', 'l.id = p.canonical_listing_id')
      .where('l.item_id = :itemId', { itemId })
      .andWhere('se.is_winner IS NULL')
      .getMany();
  }
}
