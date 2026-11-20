import { ebaySellGaps, EbaySellEnv } from '../../domain/listing/ebay-sell-readiness';

export const INTEGRATION_PLACEHOLDER = 'unused-mock-provider-active';

export interface IntegrationStatus {
  geminiLive: boolean;
  ebayLive: boolean;
  /** True, wenn User-Token und Geschäftsrichtlinien für das Einstellen auf eBay.de da sind. */
  ebayPublishReady: boolean;
  ebayPublishMissing: string[];
  photoStorageDurable: boolean;
  /** Ankaufportale haben hier keine echte Schnittstelle. */
  buybackLive: false;
}

export function isRealSecret(value: string | undefined | null): boolean {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 && trimmed !== INTEGRATION_PLACEHOLDER;
}

export function integrationStatus(env: {
  geminiApiKey?: string | null;
  ebayClientId?: string | null;
  ebayClientSecret?: string | null;
  ebayRefreshToken?: string | null;
  ebayFulfillmentPolicyId?: string | null;
  ebayPaymentPolicyId?: string | null;
  ebayReturnPolicyId?: string | null;
  ebayMerchantLocationKey?: string | null;
  ebayEnvironment?: string | null;
  s3Bucket?: string | null;
}): IntegrationStatus {
  const sell: EbaySellEnv = {
    clientId: env.ebayClientId,
    clientSecret: env.ebayClientSecret,
    refreshToken: env.ebayRefreshToken,
    fulfillmentPolicyId: env.ebayFulfillmentPolicyId,
    paymentPolicyId: env.ebayPaymentPolicyId,
    returnPolicyId: env.ebayReturnPolicyId,
    merchantLocationKey: env.ebayMerchantLocationKey,
    environment: env.ebayEnvironment,
  };
  const gaps = ebaySellGaps(sell);
  return {
    geminiLive: isRealSecret(env.geminiApiKey),
    ebayLive: isRealSecret(env.ebayClientId) && isRealSecret(env.ebayClientSecret),
    ebayPublishReady: gaps.length === 0,
    ebayPublishMissing: gaps.map((gap) => gap.message),
    photoStorageDurable: Boolean(env.s3Bucket?.trim()),
    buybackLive: false,
  };
}
