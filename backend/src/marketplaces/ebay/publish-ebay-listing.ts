import { EbaySellException } from '../../domain/errors/ebay-sell.exception';
import { fillEbayAspects } from '../../domain/listing/ebay-aspects';
import { mapConditionToEbay } from '../../domain/listing/ebay-condition';
import { ebayPhotoUrls } from '../../domain/listing/public-photo-url';
import {
  EbaySellEnv,
  ebaySellGaps,
  fulfillmentPolicyId,
} from '../../domain/listing/ebay-sell-readiness';
import { EbayPublishMeta, EbaySellTransport } from './ebay-sell.types';

export interface EbayListingDraft {
  projectionId: string;
  title: string;
  description: string;
  priceEur: number;
  condition: string | null;
  pickupOnly: boolean;
  attributes: Record<string, string | null | undefined>;
  brandFallback: string | null;
  photoUrls: string[];
}

export function ebaySku(projectionId: string): string {
  return `r-${projectionId.replace(/-/g, '')}`.slice(0, 50);
}

function money(value: number): string {
  return value.toFixed(2);
}

/**
 * Legt Bestand, Angebot und Veröffentlichung über die Sell Inventory API an.
 * Bricht mit einer deutschen Meldung ab, sobald Kategorie, Pflichtangabe,
 * Foto oder Richtlinie fehlt. Es gibt keine Ersatz-ID.
 */
export interface PublishedEbayListing {
  externalPlatformId: string;
  requiresManualConfirmation: false;
  publishMeta: EbayPublishMeta;
}

export async function publishEbayListing(
  draft: EbayListingDraft,
  env: EbaySellEnv,
  transport: EbaySellTransport,
): Promise<PublishedEbayListing> {
  const gaps = ebaySellGaps(env, { pickupOnly: draft.pickupOnly });
  if (gaps.length > 0) {
    throw new EbaySellException(gaps.map((gap) => gap.message).join(' '), {
      missing: gaps.map((gap) => gap.key),
    });
  }

  const title = draft.title.trim().slice(0, 80);
  if (title.length < 2) {
    throw new EbaySellException('Der eBay-Titel fehlt. Ohne Titel legt eBay kein Angebot an.');
  }
  if (!(draft.priceEur > 0)) {
    throw new EbaySellException('Der eBay-Preis fehlt oder ist 0. Trag einen Preis ein, bevor die Anzeige online geht.');
  }

  const condition = mapConditionToEbay(draft.condition);
  if (!condition) {
    throw new EbaySellException(
      'Der Zustand ist für eBay nicht eindeutig. Wähle Neu, Wie neu, Gut, Gebraucht oder Defekt, bevor die Anzeige online geht.',
    );
  }

  const photos = ebayPhotoUrls(draft.photoUrls);
  if ('message' in photos) throw new EbaySellException(photos.message);

  const suggestion = await transport.suggestCategory(title);
  if (!suggestion) {
    throw new EbaySellException(
      'eBay findet zu diesem Titel keine Kategorie. Formuliere den Titel konkreter (Marke und Artikelart) und versuche es erneut.',
    );
  }

  const definitions = await transport.aspectsForCategory(suggestion.categoryId);
  const filled = fillEbayAspects({
    definitions,
    attributes: draft.attributes,
    brandFallback: draft.brandFallback,
  });
  if (filled.missing.length > 0) {
    throw new EbaySellException(
      `eBay verlangt für „${suggestion.categoryName}“ noch: ${filled.missing.join(', ')}. Diese Angaben stehen nicht in der Analyse. Ergänze sie am Artikel oder wähle einen Titel, der in eine passendere Kategorie führt.`,
      { missingAspects: filled.missing, categoryId: suggestion.categoryId },
    );
  }

  const sku = ebaySku(draft.projectionId);
  const policyId = fulfillmentPolicyId(env, draft.pickupOnly);
  await transport.putInventoryItem(sku, {
    condition: condition.code,
    availability: { shipToLocationAvailability: { quantity: 1 } },
    product: {
      title,
      description: draft.description.trim().slice(0, 4000),
      aspects: filled.aspects,
      imageUrls: photos.ok,
    },
  });

  const offer = await transport.createOffer({
    sku,
    marketplaceId: 'EBAY_DE',
    format: 'FIXED_PRICE',
    availableQuantity: 1,
    categoryId: suggestion.categoryId,
    listingDescription: draft.description.trim(),
    listingPolicies: {
      fulfillmentPolicyId: policyId,
      paymentPolicyId: env.paymentPolicyId!.trim(),
      returnPolicyId: env.returnPolicyId!.trim(),
    },
    pricingSummary: { price: { value: money(draft.priceEur), currency: 'EUR' } },
    merchantLocationKey: env.merchantLocationKey!.trim(),
  });

  const published = await transport.publishOffer(offer.offerId);
  const publishMeta: EbayPublishMeta = {
    sku,
    offerId: offer.offerId,
    listingId: published.listingId,
    categoryId: suggestion.categoryId,
    categoryName: suggestion.categoryName,
    conditionId: condition.conditionId,
    fulfillmentPolicyId: policyId,
  };

  return {
    externalPlatformId: published.listingId,
    requiresManualConfirmation: false,
    publishMeta,
  };
}
