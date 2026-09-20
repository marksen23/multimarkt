import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CapabilityCheckFailedException,
  UnconfirmedConditionException,
} from '../../domain/errors/state-transition.errors';
import {
  CanonicalListingEntity,
  ItemAttributeEntity,
  ItemEntity,
} from '../../infrastructure/database/entities';
import { getCapabilityProfile } from './marketplace-capabilities.registry';

export interface CapabilityCheckResult {
  ok: true;
  /** In marketplace_projections.fallback_data zu persistierende Ersatzwerte. */
  fallbackData: Record<string, string>;
}

/**
 * CapabilityCheckService (Doc 03 §6, Doc 04 §15): wird vor jedem
 * `PUBLISHING`-Übergang aufgerufen. Zwei Prüfungen, beide 422
 * (`ERR_UNCONFIRMED_CONDITION` bzw. `ERR_CAPABILITY_CHECK_FAILED`):
 *
 * 1. universell (jeder Marktplatz): der Zustand (`condition`) muss bestätigt
 *    sein — Defense-in-Depth zusätzlich zur Precondition in Schritt 3
 *    (Doc 02 §11), damit Publish niemals von einer geschwächten früheren
 *    Prüfung abhängt (T02-2).
 * 2. marktplatzspezifisch: Pflichtfelder aus der Capability-Registry.
 */
@Injectable()
export class CapabilityCheckService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async check(canonicalListingId: string, marketplaceId: string): Promise<CapabilityCheckResult> {
    const listing = await this.dataSource.manager.findOneBy(CanonicalListingEntity, {
      id: canonicalListingId,
    });
    if (!listing) throw new NotFoundException(`Canonical listing ${canonicalListingId} not found`);

    // Bundle-Listings haben kein Item und damit keine item_attributes-Historie;
    // die marktplatzspezifische Pflichtfeldprüfung bleibt bewusst auf
    // Item-Listings beschränkt (Bundle-Kapazitäten sind Teil der
    // Bundle-Engine, nicht dieses Service).
    if (!listing.itemId) {
      return { ok: true, fallbackData: {} };
    }

    const item = await this.dataSource.manager.findOneByOrFail(ItemEntity, { id: listing.itemId });

    // (1) Universelle Precondition — T02-2.
    if (!item.condition) {
      throw new UnconfirmedConditionException(
        'Item condition must be USER_CONFIRMED before this listing can be published',
        { canonicalListingId, itemId: item.id },
      );
    }

    const profile = getCapabilityProfile(marketplaceId);
    const attributes = await this.dataSource.manager.find(ItemAttributeEntity, {
      where: { itemId: item.id },
    });
    const byKey = new Map(attributes.map((a) => [a.attributeKey, a]));

    const missing: string[] = [];
    const fallbackData: Record<string, string> = {};

    for (const key of profile.requiredAttributeKeys) {
      const attr = byKey.get(key);
      const hasConfirmedOrInferredValue =
        attr && attr.truthState !== 'UNKNOWN' && attr.attributeValue;

      if (hasConfirmedOrInferredValue) continue;

      const fallback = profile.genericFallbacks[key];
      if (fallback) {
        fallbackData[key] = fallback; // Ebene B — Projection-only, kein ProductTruth-Schreibzugriff.
      } else {
        missing.push(key); // Ebene C — hart blockiert.
      }
    }

    if (missing.length > 0) {
      throw new CapabilityCheckFailedException(
        `Marketplace '${marketplaceId}' requires fields that are missing and have no generic fallback: ${missing.join(', ')}`,
        { canonicalListingId, marketplaceId, missing },
      );
    }

    return { ok: true, fallbackData };
  }
}
