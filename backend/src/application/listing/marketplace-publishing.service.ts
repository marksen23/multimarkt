import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../domain/actor-context';
import {
  MARKETPLACE_ADAPTERS,
  MarketplaceAdapterRegistry,
} from '../../domain/marketplace/marketplace-adapter.interface';
import { CanonicalListingEntity, MarketplaceProjectionEntity } from '../../infrastructure/database/entities';
import { CapabilityCheckService } from '../capability-check/capability-check.service';
import { StateGuardService } from '../state-guard/state-guard.service';

/**
 * Orchestriert den vollständigen Publish-Pfad (Doc 02 §5, Doc 03 §6).
 *
 * BUG-FIX (siehe Abschlussbericht): der bisherige `ListingsController.publish()`
 * löste nur READY->PUBLISHING aus. Zwei Lücken machten das zu einer
 * Sackgasse: (1) frische Listings starten in DRAFT, aber nichts rief je
 * `MARK_READY`, also schlug `PUBLISH` strukturell fehl (409); (2) selbst
 * bei Erfolg blieb die Projection für immer in PUBLISHING, weil nie
 * `PUBLISH_SUCCESS` gesendet wurde. Dieser Service schließt beide Lücken
 * über die Marketplace-Adapter-Abstraktion.
 */
@Injectable()
export class MarketplacePublishingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stateGuard: StateGuardService,
    private readonly capabilityCheck: CapabilityCheckService,
    @Inject(MARKETPLACE_ADAPTERS) private readonly adapters: MarketplaceAdapterRegistry,
  ) {}

  async publish(projectionId: string, actor: ActorContext): Promise<MarketplaceProjectionEntity> {
    const projection = await this.dataSource.manager.findOneBy(MarketplaceProjectionEntity, {
      id: projectionId,
    });
    if (!projection) throw new NotFoundException(`Listing ${projectionId} not found`);

    // Doc 03 §6: CapabilityCheck MUSS vor jedem PUBLISHING-Event laufen.
    const { fallbackData } = await this.capabilityCheck.check(
      projection.canonicalListingId,
      projection.marketplaceId,
    );
    if (Object.keys(fallbackData).length > 0) {
      await this.dataSource.manager.update(MarketplaceProjectionEntity, { id: projectionId }, { fallbackData });
    }

    if (projection.status === 'DRAFT') {
      // Kein Human-Gate (Doc 02 §5: "Config komplett" ist automatische
      // Ableitung) — CapabilityCheck oben hat das bereits bestätigt.
      await this.stateGuard.transitionProjection(projectionId, {
        type: 'MARK_READY',
        actor: { type: 'SYSTEM' },
      });
    }

    // Human-Gate (Doc 04 §9 "[Human-Gate]") — nur hier greift `actor` wie übergeben.
    const publishing = await this.stateGuard.transitionProjection(projectionId, {
      type: 'PUBLISH',
      actor,
    });

    const listing = await this.dataSource.manager.findOneByOrFail(CanonicalListingEntity, {
      id: publishing.canonicalListingId,
    });
    const adapter = this.adapters.get(publishing.marketplaceId);
    if (!adapter) {
      throw new NotFoundException(
        `No marketplace adapter registered for '${publishing.marketplaceId}'`,
      );
    }

    const result = await adapter.publish({
      canonicalListingId: listing.id,
      marketplaceId: publishing.marketplaceId,
      sellingPrice: listing.sellingPrice,
      descriptionText: listing.descriptionText,
      // fallbackData ist JSONB (Record<string, unknown>), enthält aber laut
      // CapabilityCheckService (Quelle dieser Werte) ausschließlich Strings.
      fallbackData: publishing.fallbackData as Record<string, string>,
    });

    if (result.externalPlatformId) {
      await this.dataSource.manager.update(
        MarketplaceProjectionEntity,
        { id: projectionId },
        { externalPlatformId: result.externalPlatformId },
      );
    }

    if (result.requiresManualConfirmation) {
      // Formatierungshilfe (Doc 01 §9): bleibt in PUBLISHING, bis der Nutzer
      // `confirmPublished()` aufruft — kein Fallback-Bleed, keine erfundene
      // "Live"-ID (Doc 03 §3.5).
      return this.dataSource.manager.findOneByOrFail(MarketplaceProjectionEntity, {
        id: projectionId,
      });
    }

    return this.stateGuard.transitionProjection(projectionId, {
      type: 'PUBLISH_SUCCESS',
      actor: { type: 'SYSTEM' },
    });
  }

  /** Doc 02 §5 "User Copy" — Nutzer bestätigt manuelles Einstellen bei Formatierungshilfe-Plattformen. */
  async confirmPublished(
    projectionId: string,
    actor: ActorContext,
  ): Promise<MarketplaceProjectionEntity> {
    return this.stateGuard.transitionProjection(projectionId, {
      type: 'PUBLISH_SUCCESS',
      actor,
    });
  }

  async confirmCancellation(
    projectionId: string,
    actor: ActorContext,
  ): Promise<MarketplaceProjectionEntity> {
    const projection = await this.dataSource.manager.findOneBy(MarketplaceProjectionEntity, {
      id: projectionId,
    });
    if (!projection) throw new NotFoundException(`Listing ${projectionId} not found`);

    const adapter = this.adapters.get(projection.marketplaceId);
    if (adapter && projection.externalPlatformId) {
      // Doc 03 §10 Pfad A: nur bei verifizierter API-Bestätigung gilt das
      // Storno als abgeschlossen. Für die Formatierungshilfe (kein
      // externalPlatformId) bleibt es reine Human Assertion (Pfad B).
      await adapter.delist(projection.externalPlatformId);
    }

    return this.stateGuard.transitionProjection(projectionId, {
      type: 'CONFIRM_CANCELLATION',
      actor,
    });
  }
}
