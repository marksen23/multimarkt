export const INTEGRATION_PLACEHOLDER = 'unused-mock-provider-active';

export interface IntegrationStatus {
  geminiLive: boolean;
  ebayLive: boolean;
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
  s3Bucket?: string | null;
}): IntegrationStatus {
  return {
    geminiLive: isRealSecret(env.geminiApiKey),
    ebayLive: isRealSecret(env.ebayClientId) && isRealSecret(env.ebayClientSecret),
    photoStorageDurable: Boolean(env.s3Bucket?.trim()),
    buybackLive: false,
  };
}
