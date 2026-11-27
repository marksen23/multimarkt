const PLACEHOLDER = 'unused-mock-provider-active';

export function ebayValueConfigured(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 && trimmed !== PLACEHOLDER;
}

/**
 * Ein Verkäufer, eine Umgebung. Die Sell-API braucht ein User-Token
 * (Refresh Token) und die Geschäftsrichtlinien. App-ID und Cert-ID der
 * Browse-Suche reichen zum Einstellen nicht.
 */
export interface EbaySellEnv {
  clientId?: string | null;
  clientSecret?: string | null;
  refreshToken?: string | null;
  fulfillmentPolicyId?: string | null;
  paymentPolicyId?: string | null;
  returnPolicyId?: string | null;
  merchantLocationKey?: string | null;
  pickupFulfillmentPolicyId?: string | null;
  /** Leer heißt Production (`api.ebay.com`). `sandbox` nur mit Sandbox-Token. */
  environment?: string | null;
}

export interface EbaySellGap {
  key: string;
  message: string;
}

const ENVIRONMENT_VALUES = new Set(['production', 'sandbox']);

export function ebayApiHost(environment: string | null | undefined): string {
  return environment?.trim().toLowerCase() === 'sandbox'
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com';
}

export function ebaySellGaps(env: EbaySellEnv, options?: { pickupOnly?: boolean }): EbaySellGap[] {
  const gaps: EbaySellGap[] = [];
  const missing = (key: string, message: string, value: string | null | undefined) => {
    if (!ebayValueConfigured(value)) gaps.push({ key, message });
  };

  missing(
    'EBAY_CLIENT_ID',
    'EBAY_CLIENT_ID fehlt. Production App ID (Client ID) unter https://developer.ebay.com/my/keys, Keyset Production.',
    env.clientId,
  );
  missing(
    'EBAY_CLIENT_SECRET',
    'EBAY_CLIENT_SECRET fehlt. Dieselbe Keyset-Seite, Feld Cert ID (Client Secret).',
    env.clientSecret,
  );
  missing(
    'EBAY_REFRESH_TOKEN',
    'Das eBay-Konto ist noch nicht verbunden. Auf der Seite Einrichtung „Mit eBay verbinden“ tippen. EBAY_REFRESH_TOKEN in Coolify gilt nur als Ersatz.',
    env.refreshToken,
  );
  missing(
    'EBAY_FULFILLMENT_POLICY_ID',
    'Die Versandrichtlinie fehlt. Auf der Seite Einrichtung eine Geschäftsrichtlinie wählen. EBAY_FULFILLMENT_POLICY_ID in Coolify gilt nur als Ersatz.',
    env.fulfillmentPolicyId,
  );
  missing(
    'EBAY_PAYMENT_POLICY_ID',
    'Die Zahlungsrichtlinie fehlt. Auf der Seite Einrichtung eine Geschäftsrichtlinie wählen. EBAY_PAYMENT_POLICY_ID in Coolify gilt nur als Ersatz.',
    env.paymentPolicyId,
  );
  missing(
    'EBAY_RETURN_POLICY_ID',
    'Die Rückgaberichtlinie fehlt. Auf der Seite Einrichtung eine Geschäftsrichtlinie wählen. EBAY_RETURN_POLICY_ID in Coolify gilt nur als Ersatz.',
    env.returnPolicyId,
  );
  missing(
    'EBAY_MERCHANT_LOCATION_KEY',
    'Der Lagerstandort fehlt. Auf der Seite Einrichtung einen Standort wählen oder anlegen. EBAY_MERCHANT_LOCATION_KEY in Coolify gilt nur als Ersatz.',
    env.merchantLocationKey,
  );

  if (options?.pickupOnly) {
    missing(
      'EBAY_PICKUP_FULFILLMENT_POLICY_ID',
      'Der Artikel ist nur zur Abholung. Auf der Seite Einrichtung eine Versandrichtlinie mit Abholung vor Ort wählen. EBAY_PICKUP_FULFILLMENT_POLICY_ID in Coolify gilt nur als Ersatz.',
      env.pickupFulfillmentPolicyId,
    );
  }

  const environment = env.environment?.trim().toLowerCase() ?? '';
  if (environment && !ENVIRONMENT_VALUES.has(environment)) {
    gaps.push({
      key: 'EBAY_ENVIRONMENT',
      message: 'EBAY_ENVIRONMENT muss leer (Production), production oder sandbox sein.',
    });
  }

  return gaps;
}

export function fulfillmentPolicyId(env: EbaySellEnv, pickupOnly: boolean): string {
  if (pickupOnly) return env.pickupFulfillmentPolicyId?.trim() ?? '';
  return env.fulfillmentPolicyId?.trim() ?? '';
}

/** Umgebungsvariablen. Eine gespeicherte Verbindung ersetzt Token und Richtlinien später. */
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
