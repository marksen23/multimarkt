import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  BundleEntity,
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
export type EvaluateSaleOutcome =
  | 'SOLD'
  | 'CONFLICT'
  | 'CONFLICT_UNSUPPORTED_FOR_BUNDLE'
  | 'ALREADY_RESOLVED'
  | 'NO_REPORTS';

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
 *    danach einen verzögerten BullMQ-Job für `evaluate*SaleOutcome` einplant
 *    (Debounce-Fenster, damit nahezu gleichzeitige Reports beide Zeit haben
 *    zu landen, bevor entschieden wird) — die Queue-Anbindung selbst ist
 *    bewusst Schritt-5-Scope (Webhooks/Async Jobs), damit dieser Service
 *    unabhängig von Redis allein gegen Testcontainers-Postgres beweisbar
 *    bleibt.
 * 2. `evaluateItemSaleOutcome()` / `evaluateBundleSaleOutcome()` — läuft
 *    NACH dem Debounce-Fenster (oder direkt im Test). Lockt das Aggregat,
 *    zählt ALLE jemals dafür erfassten Sale-Events (nicht nur
 *    unentschiedene) und entscheidet deterministisch: genau 1 -> SOLD, mehr
 *    als 1 -> Konflikt. Idempotent: ist das Aggregat bereits nicht mehr
 *    LISTED (z.B. weil eine frühere Auswertung schon entschieden hat),
 *    passiert nichts.
 *
 * SCHEMA-LÜCKE (bewusst nicht umgangen, siehe Abschlussbericht):
 * `bundle_lifecycle_state` (Doc 01, eingefroren) kennt — anders als
 * `item_lifecycle_state` — KEINEN `SALE_CONFLICT`-Wert. Ein Bundle mit
 * mehreren, sich widersprechenden Verkaufsmeldungen kann daher strukturell
 * nicht in einen Konfliktzustand überführt werden, ohne den eingefrorenen
 * Vertrag zu ändern. `evaluateBundleSaleOutcome` erkennt diesen Fall,
 * belässt das Bundle bewusst unverändert in `LISTED` (keine Seite gewinnt
 * automatisch) und meldet `CONFLICT_UNSUPPORTED_FOR_BUNDLE` — die
 * Sale-Events bleiben `isWinner: NULL` und damit für eine manuelle Prüfung
 * sichtbar, statt dass das Backend eine Entscheidung erfindet, die das
 * Schema nicht vorsieht.
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

      if (item.status !== 'LISTED') {
        return 'ALREADY_RESOLVED';
      }

      const reports = await this.loadOpenReports(manager, 'item_id', itemId);
      if (reports.length === 0) return 'NO_REPORTS';

      if (reports.length === 1) {
        await this.markWinnerAndSell(manager, reports[0], () =>
          this.stateGuard.transitionItemWithManager(manager, itemId, {
            type: 'SALE_CONFIRMED_SINGLE',
            actor: { type: 'SYSTEM' },
          }),
        );
        return 'SOLD';
      }

      // Mehr als ein Report für dasselbe Item, während es noch LISTED war
      // -> deterministischer Konflikt (Doc 02 §8 Punkt 1). Alle Reports
      // bleiben unentschieden (isWinner NULL), bis ein USER-Actor
      // resolve-conflict aufruft (Doc 04 §13.1).
      await this.stateGuard.transitionItemWithManager(manager, itemId, {
        type: 'SALE_CONFLICT_DETECTED',
        actor: { type: 'SYSTEM' },
      });
      return 'CONFLICT';
    });
  }

  async evaluateBundleSaleOutcome(bundleId: string): Promise<EvaluateSaleOutcome> {
    return this.dataSource.transaction(async (manager) => {
      const bundle = await manager.findOne(BundleEntity, {
        where: { id: bundleId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!bundle) throw new NotFoundException(`Bundle ${bundleId} not found`);

      if (bundle.status !== 'LISTED') {
        return 'ALREADY_RESOLVED';
      }

      const reports = await this.loadOpenReports(manager, 'bundle_id', bundleId);
      if (reports.length === 0) return 'NO_REPORTS';

      if (reports.length === 1) {
        await this.markWinnerAndSell(manager, reports[0], () =>
          this.stateGuard.transitionBundleWithManager(manager, bundleId, {
            type: 'SALE_CONFIRMED',
            actor: { type: 'SYSTEM' },
          }),
        );
        return 'SOLD';
      }

      // Siehe Klassen-Dokumentation: bundle_lifecycle_state kennt keinen
      // SALE_CONFLICT-Wert. Bundle bleibt bewusst unangetastet in LISTED.
      return 'CONFLICT_UNSUPPORTED_FOR_BUNDLE';
    });
  }

  private async markWinnerAndSell(
    manager: EntityManager,
    winningReport: SaleEventEntity,
    transitionOwner: () => Promise<unknown>,
  ): Promise<void> {
    await manager.update(SaleEventEntity, { id: winningReport.id }, { isWinner: true });
    await transitionOwner();
    await this.stateGuard.transitionProjectionWithManager(manager, winningReport.projectionId, {
      type: 'SOLD_HERE',
      actor: { type: 'SYSTEM' },
    });
  }

  private async loadOpenReports(
    manager: EntityManager,
    ownerColumn: 'item_id' | 'bundle_id',
    ownerId: string,
  ): Promise<SaleEventEntity[]> {
    return manager
      .createQueryBuilder(SaleEventEntity, 'se')
      .innerJoin(MarketplaceProjectionEntity, 'p', 'p.id = se.projection_id')
      .innerJoin(CanonicalListingEntity, 'l', 'l.id = p.canonical_listing_id')
      .where(`l.${ownerColumn} = :ownerId`, { ownerId })
      .andWhere('se.is_winner IS NULL')
      .getMany();
  }
}
