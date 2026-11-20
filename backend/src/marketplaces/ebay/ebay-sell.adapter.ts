import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EbaySellException } from '../../domain/errors/ebay-sell.exception';
import { EbaySellEnv, ebaySellGaps } from '../../domain/listing/ebay-sell-readiness';
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
import { EbaySellTransport } from './ebay-sell.types';

export function readEbaySellEnv(config: { get(key: string): string | undefined }): EbaySellEnv {
  return {
    clientId: config.get('EBAY_CLIENT_ID'),
    clientSecret: config.get('EBAY_CLIENT_SECRET'),
    refreshToken: config.get('EBAY_REFRESH_TOKEN'),
    fulfillmentPolicyId: config.get('EBAY_FULFILLMENT_POLICY_ID'),
    paymentPolicyId: config.get('EBAY_PAYMENT_POLICY_ID'),
    returnPolicyId: config.get('EBAY_RETURN_POLICY_ID'),
    merchantLocationKey: config.get('EBAY_MERCHANT_LOCATION_KEY'),
    pickupFulfillmentPolicyId: config.get('EBAY_PICKUP_FULFILLMENT_POLICY_ID'),
    environment: config.get('EBAY_ENVIRONMENT'),
  };
}

/**
 * Offizielle eBay Sell Inventory API für ebay.de.
 * Ohne Token oder Geschäftsrichtlinien schlägt `publish` mit einer deutschen
 * Meldung fehl. Es wird keine Anzeigen-ID erfunden.
 */
@Injectable()
export class EbaySellAdapter implements MarketplaceAdapter {
  constructor(
    private readonly config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly transport?: EbaySellTransport,
  ) {}

  async publish(input: MarketplacePublishInput): Promise<MarketplacePublishResult> {
    const env = readEbaySellEnv(this.config);
    const gaps = ebaySellGaps(env);
    if (gaps.length > 0) {
      throw new EbaySellException(gaps.map((gap) => gap.message).join(' '), {
        missing: gaps.map((gap) => gap.key),
      });
    }
    const draft = await this.loadDraft(input);
    const transport = this.transport ?? new EbaySellClient(env);
    const result = await publishEbayListing(draft, env, transport);
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
    const env = readEbaySellEnv(this.config);
    const transport = this.transport ?? new EbaySellClient(env);
    await transport.withdrawOffer(offerId.trim());
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
        order: { createdAt: 'ASC' },
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
      photoUrls: photos.map((photo) => photo.url),
    };
  }
}
