import { EbaySellException } from '../../domain/errors/ebay-sell.exception';
import { EbaySellEnv } from '../../domain/listing/ebay-sell-readiness';
import { publishEbayListing, EbayListingDraft } from './publish-ebay-listing';
import { EbaySellTransport } from './ebay-sell.types';

const env: EbaySellEnv = {
  clientId: 'app',
  clientSecret: 'cert',
  refreshToken: 'refresh',
  fulfillmentPolicyId: 'ship-1',
  paymentPolicyId: 'pay-1',
  returnPolicyId: 'ret-1',
  merchantLocationKey: 'lager-koeln',
  pickupFulfillmentPolicyId: 'pickup-1',
};

const draft: EbayListingDraft = {
  projectionId: '11111111-1111-1111-1111-111111111111',
  title: 'Nike Air Max 42',
  description: 'Getragen, siehe Fotos.',
  priceEur: 49.5,
  condition: 'Gut',
  pickupOnly: false,
  attributes: { brand: 'Nike', size: '42', color: 'Schwarz' },
  brandFallback: null,
  photoUrls: ['https://cdn.example.test/a.jpg'],
};

function transport(): EbaySellTransport & {
  put: jest.Mock;
  offer: jest.Mock;
  publish: jest.Mock;
} {
  const put = jest.fn().mockResolvedValue(undefined);
  const offer = jest.fn().mockResolvedValue({ offerId: 'offer-1' });
  const publish = jest.fn().mockResolvedValue({ listingId: '998877665544' });
  return {
    put,
    offer,
    publish,
    suggestCategory: jest.fn().mockResolvedValue({ categoryId: '15709', categoryName: 'Herren-Sneaker' }),
    aspectsForCategory: jest.fn().mockResolvedValue([
      { name: 'Marke', required: true },
      { name: 'Farbe', required: false },
      { name: 'Schuhgröße', required: true },
    ]),
    putInventoryItem: put,
    createOffer: offer,
    publishOffer: publish,
    withdrawOffer: jest.fn(),
  };
}

describe('publishEbayListing', () => {
  it('maps category, condition, specifics, photos and policies into the sell calls', async () => {
    const api = transport();
    const result = await publishEbayListing(draft, env, api);

    expect(result.externalPlatformId).toBe('998877665544');
    expect(result.requiresManualConfirmation).toBe(false);
    expect(result.publishMeta).toMatchObject({
      offerId: 'offer-1',
      listingId: '998877665544',
      categoryId: '15709',
      conditionId: '5000',
      fulfillmentPolicyId: 'ship-1',
    });
    expect(api.put).toHaveBeenCalledWith(
      expect.stringMatching(/^r-/),
      expect.objectContaining({
        condition: 'USED_GOOD',
        product: expect.objectContaining({
          title: 'Nike Air Max 42',
          imageUrls: ['https://cdn.example.test/a.jpg'],
          aspects: { Marke: ['Nike'], Farbe: ['Schwarz'], Schuhgröße: ['42'] },
        }),
      }),
    );
    expect(api.offer).toHaveBeenCalledWith(
      expect.objectContaining({
        marketplaceId: 'EBAY_DE',
        format: 'FIXED_PRICE',
        categoryId: '15709',
        merchantLocationKey: 'lager-koeln',
        listingPolicies: {
          fulfillmentPolicyId: 'ship-1',
          paymentPolicyId: 'pay-1',
          returnPolicyId: 'ret-1',
        },
        pricingSummary: { price: { value: '49.50', currency: 'EUR' } },
      }),
    );
    expect(api.publish).toHaveBeenCalledWith('offer-1');
  });

  it('uses the pickup policy when the article is pickup-only', async () => {
    const api = transport();
    await publishEbayListing({ ...draft, pickupOnly: true }, env, api);
    expect(api.offer.mock.calls[0][0].listingPolicies.fulfillmentPolicyId).toBe('pickup-1');
  });

  it('stops before any sell call when a required aspect or a public photo is missing', async () => {
    const missingAspect = transport();
    await expect(
      publishEbayListing({ ...draft, attributes: { color: 'Schwarz' } }, env, missingAspect),
    ).rejects.toThrow(/Marke/);
    expect(missingAspect.put).not.toHaveBeenCalled();

    const localPhoto = transport();
    await expect(
      publishEbayListing({ ...draft, photoUrls: ['/uploads/local.jpg'] }, env, localPhoto),
    ).rejects.toBeInstanceOf(EbaySellException);
    expect(localPhoto.suggestCategory).not.toHaveBeenCalled();
  });

  it('does not publish when the refresh token is missing', async () => {
    const api = transport();
    await expect(publishEbayListing(draft, { ...env, refreshToken: '' }, api)).rejects.toThrow(/EBAY_REFRESH_TOKEN/);
    expect(api.put).not.toHaveBeenCalled();
  });
});
