import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EbaySetupService } from '../../application/ebay/ebay-setup.service';
import { EbaySellException } from '../../domain/errors/ebay-sell.exception';
import { publishablePhoto } from '../../domain/photo/publishable-photo';
import { ebaySellGaps } from '../../domain/listing/ebay-sell-readiness';
import {
  MarketplaceAdapter,
  MarketplacePublishInput,
  MarketplacePublishResult,
} from '../../domain/marketplace/marketplace-adapter.interface';
import {
  CanonicalListingEntity,
  ItemAttributeEntity,
  ItemEntity,
  ItemPhotoEntity,
  MarketplaceProjectionEntity,
} from '../../infrastructure/database/entities';
import { EbaySellClient } from './ebay-sell.client';
import { publishEbayListing } from './publish-ebay-listing';

/**
 * Offizielle eBay Sell Inventory API für ebay.de.
 * Token und Richtlinien kommen aus der gespeicherten Verbindung, sonst aus
 * den Coolify-Variablen. Ohne sie schlägt `publish` mit einer deutschen
 * Meldung fehl. Es wird keine Anzeigen-ID erfunden.
 */
@Injectable()
export class EbaySellAdapter implements MarketplaceAdapter {
  constructor(
    private readonly ebaySetup: EbaySetupService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async publish(input: MarketplacePublishInput): Promise<MarketplacePublishResult> {
    const env = await this.ebaySetup.resolve();
    const gaps = ebaySellGaps(env);
    if (gaps.length > 0) {
      throw new EbaySellException(gaps.map((gap) => gap.message).join(' '), {
        missing: gaps.map((gap) => gap.key),
      });
    }
    const draft = await this.loadDraft(input);
    const result = await publishEbayListing(draft, env, new EbaySellClient(env));
    return {
      externalPlatformId: result.externalPlatformId,
      requiresManualConfirmation: false,
      publishMeta: { ...result.publishMeta },
    };
  }

  async delist(externalPlatformId: string, context?: { publishMeta?: Record<string, unknown> | null }): Promise<void> {
    void externalPlatformId;
    const offerId = context?.publishMeta?.offerId;
    if (typeof offerId !== 'string' || !offerId.trim()) {
      throw new EbaySellException(
        'Diese eBay-Anzeige hat keine Angebots-ID. Beende sie selbst auf ebay.de und bestätige das Zurückziehen danach.',
      );
    }
    const env = await this.ebaySetup.resolve();
    await new EbaySellClient(env).withdrawOffer(offerId.trim());
  }

  private async loadDraft(input: MarketplacePublishInput) {
    const listing = await this.dataSource.manager.findOneByOrFail(CanonicalListingEntity, {
      id: input.canonicalListingId,
    });
    if (!listing.itemId) {
      throw new EbaySellException('eBay-Anzeigen gehen von einem einzelnen Artikel aus, nicht von einem Bundle.');
    }
    const [item, projection, attributes, photos] = await Promise.all([
      this.dataSource.manager.findOneByOrFail(ItemEntity, { id: listing.itemId }),
      this.dataSource.manager.findOneByOrFail(MarketplaceProjectionEntity, { id: input.projectionId }),
      this.dataSource.manager.find(ItemAttributeEntity, { where: { itemId: listing.itemId } }),
      this.dataSource.manager.find(ItemPhotoEntity, {
        where: { itemId: listing.itemId },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      }),
    ]);

    const values: Record<string, string | null> = {};
    for (const attribute of attributes) {
      if (attribute.truthState === 'UNKNOWN') continue;
      values[attribute.attributeKey] = attribute.attributeValue;
    }

    return {
      projectionId: input.projectionId,
      title: (projection.title ?? item.title ?? '').trim(),
      description: (projection.descriptionText ?? input.descriptionText ?? '').trim(),
      priceEur: Number(projection.suggestedPrice ?? input.sellingPrice),
      condition: item.condition,
      pickupOnly: Boolean(item.pickupOnly),
      attributes: values,
      brandFallback: input.fallbackData.brand ?? null,
      photoUrls: photos.map((photo) => publishablePhoto(photo).url),
    };
  }
}
