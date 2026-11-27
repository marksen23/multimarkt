import type { EbayConnectionHealth } from '../../infrastructure/database/entities/ebay-connection.entity';

export interface EbayConnectionRecord {
  userId: string;
  refreshTokenCiphertext: string | null;
  refreshTokenExpiresAt: Date | null;
  ebayUserId: string | null;
  ebayUsername: string | null;
  connectedAt: Date | null;
  health: EbayConnectionHealth;
  healthMessage: string | null;
  healthCheckedAt: Date | null;
  fulfillmentPolicyId: string | null;
  paymentPolicyId: string | null;
  returnPolicyId: string | null;
  pickupFulfillmentPolicyId: string | null;
  merchantLocationKey: string | null;
}

export interface EbayPolicyOption {
  id: string;
  name: string;
  localPickup: boolean;
  stale?: boolean;
}

export interface EbayLocationOption {
  key: string;
  name: string;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  status: string | null;
  stale?: boolean;
}

export interface EbayCatalog {
  fulfillmentPolicies: EbayPolicyOption[];
  paymentPolicies: EbayPolicyOption[];
  returnPolicies: EbayPolicyOption[];
  locations: EbayLocationOption[];
}

export interface EbaySelection {
  fulfillmentPolicyId: string | null;
  paymentPolicyId: string | null;
  returnPolicyId: string | null;
  pickupFulfillmentPolicyId: string | null;
  merchantLocationKey: string | null;
}

export type EbayValueSource = 'database' | 'environment' | null;

export type EbaySelectionSource = Record<keyof EbaySelection, EbayValueSource>;

export const EMPTY_EBAY_CATALOG: EbayCatalog = {
  fulfillmentPolicies: [],
  paymentPolicies: [],
  returnPolicies: [],
  locations: [],
};

export const POLICIES_NOT_OPTED_IN_HINT =
  'Geschäftsrichtlinien sind auf diesem eBay-Konto noch nicht aktiv. Im Verkäufer-Cockpit unter „Geschäftsrichtlinien“ einmal einschalten und je eine Richtlinie für Versand, Zahlung und Rückgabe anlegen. Danach hier auf „Neu laden“ tippen.';

export interface EbaySetupView {
  environment: 'production' | 'sandbox';
  environmentInvalid: boolean;
  callbackUrl: string;
  clientIdReady: boolean;
  clientSecretReady: boolean;
  ruNameReady: boolean;
  encryptionReady: boolean;
  oauthReady: boolean;
  connected: boolean;
  connectionSource: EbayValueSource;
  username: string | null;
  refreshExpiresAt: string | null;
  refreshExpired: boolean;
  refreshExpiresSoon: boolean;
  health: EbayConnectionHealth;
  healthMessage: string | null;
  tokenUnreadable: boolean;
  policiesOptedIn: boolean | null;
  policiesHint: string | null;
  catalogError: string | null;
  fulfillmentPolicies: EbayPolicyOption[];
  paymentPolicies: EbayPolicyOption[];
  returnPolicies: EbayPolicyOption[];
  locations: EbayLocationOption[];
  selection: EbaySelection;
  selectionSource: EbaySelectionSource;
  autoSelected: Array<keyof EbaySelection>;
  publishReady: boolean;
  publishMissing: string[];
}
