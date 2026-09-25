import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  BundleEntity,
  CanonicalListingEntity,
  ItemEntity,
  MarketplaceProjectionEntity,
  SaleEventEntity,
} from '../../infrastructure/database/entities';
import { SaleConflictSchedulerService } from './sale-conflict-scheduler.service';

/**
 * Selbstheilungs-Sweep (September 2026, Folgefund zum jobId-Bug in
 * SaleConflictSchedulerService): `reportSale()` (DB-Insert, committet) und
 * `scheduler.scheduleEvaluation()` (separater Redis-Write) sind zwei
 * unabhängige Operationen ohne gemeinsame Transaktion. Stürzt der Prozess
 * genau zwischen beiden ab, oder ist Redis kurz nicht erreichbar, bleibt
 * ein Sale-Event dauerhaft erfasst, aber NIE ausgewertet — ohne
 * periodischen Sweep gäbe es dafür keinen Selbstheilungsweg.
 *
 * Findet Items/Bundles, die noch LISTED sind, aber mindestens ein
 * unentschiedenes (`is_winner IS NULL`) Sale-Event haben, das älter als
 * die Sweep-Gnadenfrist ist (deutlich größer als das normale
 * Debounce-Fenster, damit ein gerade erst geplanter, noch verzögerter Job
 * nicht fälschlich als "hängengeblieben" behandelt wird), und plant für
 * sie erneut eine Auswertung. `scheduleEvaluation()` ist bewusst so
 * gebaut, dass ein wiederholter Aufruf harmlos ist (siehe dortige
 * Kommentare); `evaluate*SaleOutcome()` selbst ist ebenfalls idempotent
 * (ALREADY_RESOLVED/NO_REPORTS).
 */
@Injectable()
export class SaleConflictSweepService {
  private readonly logger = new Logger(SaleConflictSweepService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scheduler: SaleConflictSchedulerService,
    private readonly config: ConfigService,
  ) {}

  async sweep(): Promise<number> {
    const graceMs = this.config.get<number>('SALE_CONFLICT_SWEEP_GRACE_MS', 5 * 60 * 1000);
    const cutoff = new Date(Date.now() - graceMs);

    const stuckItems = await this.dataSource.manager
      .createQueryBuilder(SaleEventEntity, 'se')
      .innerJoin(MarketplaceProjectionEntity, 'p', 'p.id = se.projection_id')
      .innerJoin(CanonicalListingEntity, 'l', 'l.id = p.canonical_listing_id')
      .innerJoin(ItemEntity, 'i', 'i.id = l.item_id')
      .where('se.is_winner IS NULL')
      .andWhere('se.reported_at < :cutoff', { cutoff })
      .andWhere('i.status = :status', { status: 'LISTED' })
      .select('DISTINCT l.item_id', 'itemId')
      .getRawMany<{ itemId: string }>();

    const stuckBundles = await this.dataSource.manager
      .createQueryBuilder(SaleEventEntity, 'se')
      .innerJoin(MarketplaceProjectionEntity, 'p', 'p.id = se.projection_id')
      .innerJoin(CanonicalListingEntity, 'l', 'l.id = p.canonical_listing_id')
      .innerJoin(BundleEntity, 'b', 'b.id = l.bundle_id')
      .where('se.is_winner IS NULL')
      .andWhere('se.reported_at < :cutoff', { cutoff })
      .andWhere('b.status = :status', { status: 'LISTED' })
      .select('DISTINCT l.bundle_id', 'bundleId')
      .getRawMany<{ bundleId: string }>();

    for (const { itemId } of stuckItems) {
      await this.scheduler.scheduleEvaluation('item', itemId);
    }
    for (const { bundleId } of stuckBundles) {
      await this.scheduler.scheduleEvaluation('bundle', bundleId);
    }

    const total = stuckItems.length + stuckBundles.length;
    if (total > 0) {
      this.logger.warn(
        `Sweep rescheduled ${total} stuck sale evaluation(s) (items: ${stuckItems.length}, bundles: ${stuckBundles.length})`,
      );
    }
    return total;
  }
}
