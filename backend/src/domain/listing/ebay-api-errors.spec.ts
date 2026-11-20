import { germanEbayHttpError, offerIdFromExistingOfferError } from './ebay-api-errors';

describe('germanEbayHttpError', () => {
  it('explains an expired refresh token without echoing it', () => {
    const message = germanEbayHttpError(400, {
      error: 'invalid_grant',
      error_description: 'refresh token expired: super-secret',
    });
    expect(message).toMatch(/Refresh-Token/);
    expect(message).not.toContain('super-secret');
  });

  it('reads an offer id out of the already-exists error', () => {
    const body = {
      errors: [
        {
          errorId: 25002,
          message: 'Offer entity already exists.',
          parameters: [{ name: 'offerId', value: 'offer-77' }],
        },
      ],
    };
    expect(offerIdFromExistingOfferError(body)).toBe('offer-77');
    expect(germanEbayHttpError(400, body)).toMatch(/Offer entity already exists/);
  });
});
